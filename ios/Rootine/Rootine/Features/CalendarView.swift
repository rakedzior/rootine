import SwiftUI

enum CalendarDisplayMode: String, CaseIterable, Identifiable {
    case list, day, threeDays, week, month, year
    var id: String { rawValue }
    var title: String {
        switch self {
        case .list: "Lista"
        case .day: "Dzień"
        case .threeDays: "3 dni"
        case .week: "Tydzień"
        case .month: "Miesiąc"
        case .year: "Rok"
        }
    }
    var icon: String {
        switch self {
        case .list: "list.bullet"
        case .day: "rectangle"
        case .threeDays: "rectangle.split.3x1"
        case .week: "calendar.day.timeline.left"
        case .month: "calendar"
        case .year: "square.grid.3x3"
        }
    }
}

/// Calendar arithmetic uses local dates, including across daylight-saving changes.
enum CalendarLayout {
    static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.locale = Locale(identifier: "pl_PL")
        value.firstWeekday = 2
        return value
    }
    static func adding(_ component: Calendar.Component, _ value: Int, to date: Date) -> Date {
        calendar.date(byAdding: component, value: value, to: date) ?? date
    }
    static func days(from start: Date, count: Int) -> [Date] {
        (0..<count).map { adding(.day, $0, to: start) }
    }
    static func monthDays(_ date: Date) -> [Date] {
        let start = calendar.dateInterval(of: .month, for: date)!.start
        let offset = (calendar.component(.weekday, from: start) + 5) % 7
        let count = calendar.range(of: .day, in: .month, for: start)!.count
        return days(from: adding(.day, -offset, to: start), count: ((offset + count + 6) / 7) * 7)
    }
    static func visibleDays(_ mode: CalendarDisplayMode, date: Date) -> [Date] {
        switch mode {
        case .month: return monthDays(date)
        case .list:
            let start = calendar.dateInterval(of: .month, for: date)!.start
            return days(from: start, count: calendar.range(of: .day, in: .month, for: start)!.count)
        case .day: return [calendar.startOfDay(for: date)]
        case .threeDays: return days(from: calendar.startOfDay(for: date), count: 3)
        case .week: return days(from: calendar.dateInterval(of: .weekOfYear, for: date)!.start, count: 7)
        case .year:
            let interval = calendar.dateInterval(of: .year, for: date)!
            return days(from: interval.start, count: calendar.dateComponents([.day], from: interval.start, to: interval.end).day!)
        }
    }
    static func minutes(_ time: String?) -> Int? {
        guard let time, RootineDate.isClockTime(time) else { return nil }
        let parts = time.split(separator: ":").compactMap { Int($0) }
        return parts[0] * 60 + parts[1]
    }
}

struct CalendarTaskFilter: Equatable {
    var search = ""
    var showCompleted = true
    var priority = ""
    var list = ""
    var tag = ""
    var isActive: Bool { !search.isEmpty || !showCompleted || !priority.isEmpty || !list.isEmpty || !tag.isEmpty }
    func includes(_ occurrence: RootineCalendarOccurrence) -> Bool {
        (showCompleted || !occurrence.isDone)
            && (priority.isEmpty || occurrence.task.priority?.rawValue == priority)
            && (list.isEmpty || occurrence.task.list == list)
            && (tag.isEmpty || occurrence.task.tags?.contains(tag) == true)
            && (search.isEmpty || occurrence.title.localizedStandardContains(search))
    }
}

struct CalendarView: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selectedDate = Date()
    @State private var mode: CalendarDisplayMode = .month
    @State private var filter = CalendarTaskFilter()
    @State private var showFilters = false
    @State private var showAgenda = false
    @State private var showComposer = false
    @State private var selectedOccurrence: RootineCalendarOccurrence?

    private var days: [Date] { CalendarLayout.visibleDays(mode, date: selectedDate) }
    private var occurrences: [RootineCalendarOccurrence] {
        let start = RootineDate.localDate(days.first ?? selectedDate)
        let end = RootineDate.localDate(days.last ?? selectedDate)
        var result = rootineTaskOccurrences(environment.taskWorkspace.tasks, from: start, through: end)
        let today = RootineDate.localDate()
        if start <= today && today <= end {
            let existing = Set(result.map(\.sourceTaskID))
            result += environment.taskWorkspace.tasks.filter {
                $0.deleted != true && $0.calendarDate == nil && $0.date == nil && $0.view == "dzis" && !existing.contains($0.id)
            }.map { RootineCalendarOccurrence(key: "task:\($0.id)@\(today)", task: $0, calendarDate: today, isVirtual: false) }
        }
        return result.filter(filter.includes).sorted {
            if $0.calendarDate != $1.calendarDate { return $0.calendarDate < $1.calendarDate }
            if $0.time != $1.time { return ($0.time ?? "") < ($1.time ?? "") }
            return $0.sourceTaskID < $1.sourceTaskID
        }
    }
    private var grouped: [String: [RootineCalendarOccurrence]] { Dictionary(grouping: occurrences, by: \.calendarDate) }
    private var periodTitle: String {
        calendarLabel(selectedDate, format: mode == .year ? "yyyy" : mode == .day ? "d MMMM yyyy" : "LLLL yyyy")
    }

    var body: some View {
        VStack(spacing: 0) {
            periodNavigation
            if filter.isActive {
                HStack {
                    Button("Aktywne filtry") { showFilters = true }
                    Spacer()
                    Button("Wyczyść") { filter = CalendarTaskFilter() }
                }
                .font(.caption).padding(.horizontal, 20).padding(.bottom, 8)
            }
            calendarContent
        }
        .background(RootineTheme.ColorToken.canvas.ignoresSafeArea())
        .overlay(alignment: .top) {
            if case .localOnly = environment.workspaceSyncStatus {
                RootineOfflineBanner()
                    .background(RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: RootineTheme.Radius.control))
                    .padding(.horizontal, 16).allowsHitTesting(false)
            } else if case .conflict = environment.workspaceSyncStatus {
                RootineErrorState(title: "Konflikt synchronizacji",
                    message: "Zmiany są bezpieczne lokalnie. Spróbuj zsynchronizować je ponownie.",
                    onRetry: { Task { await environment.flushPendingMutations() } })
                    .background(RootineTheme.ColorToken.surface).padding(16)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    ForEach(CalendarDisplayMode.allCases) { item in
                        Button {
                            mode = item
                        } label: {
                            Label(item.title, systemImage: mode == item ? "checkmark" : item.icon)
                        }
                        .accessibilityIdentifier("calendar-mode-\(item.rawValue)")
                    }
                } label: { Image(systemName: mode.icon).frame(width: 44, height: 44) }
                .accessibilityLabel("Widok kalendarza: \(mode.title)")
                .accessibilityIdentifier("calendar-view-menu")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showFilters = true } label: {
                    Image(systemName: filter.isActive ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Filtry kalendarza")
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if mode != .year {
            Button { showComposer = true } label: {
                Image(systemName: "plus").font(.title2.weight(.semibold))
                    .foregroundStyle(.white).frame(width: 56, height: 56)
                    .background(RootineTheme.ColorToken.action, in: Circle())
            }
            .accessibilityLabel("Dodaj zadanie")
            .accessibilityIdentifier("calendar-add")
            .padding(20)
            }
        }
        .sheet(isPresented: $showFilters) { filterSheet }
        .sheet(isPresented: $showComposer) {
            TaskComposerSheet(date: selectedDate)
        }
        .sheet(item: $selectedOccurrence) { occurrence in
            TaskDetailSheet(task: occurrence.task, completionDate: RootineDate.localDateValue(occurrence.calendarDate) ?? selectedDate)
                .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        }
    }

    private var periodNavigation: some View {
        HStack(spacing: 0) {
            Button { move(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                .accessibilityLabel("Poprzedni okres")
            Text(periodTitle).font(.headline).foregroundStyle(RootineTheme.ColorToken.primaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
            if mode == .month && showAgenda {
                Button { withAnimation(reduceMotion ? nil : .snappy) { showAgenda = false } } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right").frame(width: 44, height: 44)
                }.accessibilityLabel("Zwiń plan dnia")
            }
            Button("Dziś") { selectedDate = Date() }
                .font(.subheadline.weight(.medium)).frame(minWidth: 44, minHeight: 44)
            Button { move(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                .accessibilityLabel("Następny okres")
        }
        .padding(.horizontal, 8).padding(.bottom, 8)
    }

    @ViewBuilder private var calendarContent: some View {
        switch mode {
        case .month:
            CalendarMonthGrid(date: selectedDate, grouped: grouped, expanded: showAgenda,
                onSelectTask: { selectedOccurrence = $0 }, onToggle: toggle) { date in
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.25)) {
                    let sameDay = CalendarLayout.calendar.isDate(date, inSameDayAs: selectedDate)
                    selectedDate = date
                    showAgenda = sameDay ? !showAgenda : true
                }
            }
        case .year:
            CalendarYearGrid(date: selectedDate, occupiedDates: Set(grouped.keys)) { date in
                selectedDate = date
                mode = .month
            }
        case .list:
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    if occurrences.isEmpty { calendarEmptyState }
                    ForEach(grouped.keys.sorted(), id: \.self) { key in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(calendarLabel(RootineDate.localDateValue(key) ?? selectedDate, format: "EEEE, d MMMM"))
                                .font(.subheadline.weight(.semibold)).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                            CalendarAgendaRows(tasks: grouped[key] ?? [], onSelect: { selectedOccurrence = $0 }, onToggle: toggle)
                        }
                    }
                }.padding(16).padding(.bottom, 80)
            }.refreshable { await environment.flushPendingMutations() }
        case .day, .threeDays, .week:
            CalendarTimeGrid(days: days, grouped: grouped, onSelect: { selectedOccurrence = $0 })
        }
    }

    private var filterSheet: some View {
        NavigationStack {
            Form {
                Section { TextField("Szukaj zadania", text: $filter.search) }
                Section("Widoczność") { Toggle("Pokaż zakończone", isOn: $filter.showCompleted) }
                Section("Zakres") {
                    Picker("Priorytet", selection: $filter.priority) {
                        Text("Wszystkie").tag("")
                        Text("Wysoki").tag("high")
                        Text("Średni").tag("medium")
                        Text("Niski").tag("low")
                    }
                    Picker("Lista", selection: $filter.list) {
                        Text("Wszystkie").tag("")
                        ForEach(environment.taskWorkspace.lists, id: \.id) { Text($0.label).tag($0.id) }
                    }
                    Picker("Tag", selection: $filter.tag) {
                        Text("Wszystkie").tag("")
                        ForEach(environment.taskWorkspace.tags, id: \.id) { Text($0.label).tag($0.id) }
                    }
                }
                Button("Wyczyść filtry") { filter = CalendarTaskFilter() }.disabled(!filter.isActive)
            }
            .navigationTitle("Filtry").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gotowe") { showFilters = false } } }
        }.presentationDetents([.medium, .large])
    }

    private func move(_ step: Int) {
        showAgenda = false
        let component: Calendar.Component = mode == .year ? .year : (mode == .month || mode == .list) ? .month : .day
        let amount = step * (mode == .week ? 7 : mode == .threeDays ? 3 : 1)
        selectedDate = CalendarLayout.adding(component, amount, to: selectedDate)
    }
    private func toggle(_ occurrence: RootineCalendarOccurrence) {
        Task { await environment.toggleTaskCompletion(id: occurrence.sourceTaskID, on: RootineDate.localDateValue(occurrence.calendarDate) ?? selectedDate) }
    }
}

private struct CalendarMonthGrid: View {
    let date: Date
    let grouped: [String: [RootineCalendarOccurrence]]
    let expanded: Bool
    let onSelectTask: (RootineCalendarOccurrence) -> Void
    let onToggle: (RootineCalendarOccurrence) -> Void
    let onSelect: (Date) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var days: [Date] { CalendarLayout.monthDays(date) }
    private var selectedWeek: Int { (days.firstIndex(where: { CalendarLayout.calendar.isDate($0, inSameDayAs: date) }) ?? 0) / 7 }
    var body: some View {
        GeometryReader { geometry in
            let height = max(84, (geometry.size.height - 32) / CGFloat(days.count / 7))
            VStack(spacing: 0) {
                CalendarWeekdayLabels()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach((expanded ? selectedWeek : 0)..<(days.count / 7), id: \.self) { week in
                                HStack(spacing: 0) {
                                    ForEach(Array(days[(week * 7)..<(week * 7 + 7)]), id: \.self) { day in
                                        CalendarMonthCell(day: day, month: date,
                                            tasks: grouped[RootineDate.localDate(day)] ?? [],
                                            height: expanded ? 124 : height,
                                            selectionActive: expanded,
                                            selected: expanded && CalendarLayout.calendar.isDate(day, inSameDayAs: date)) { onSelect(day) }
                                    }
                                }.id(week)
                                if expanded && week == selectedWeek {
                                    ScrollView {
                                        VStack(alignment: .leading, spacing: 0) {
                                            if (grouped[RootineDate.localDate(date)] ?? []).isEmpty { calendarEmptyState }
                                            CalendarAgendaRows(tasks: grouped[RootineDate.localDate(date)] ?? [], onSelect: onSelectTask, onToggle: onToggle)
                                        }.padding(12).padding(.bottom, 56)
                                    }
                                    .frame(height: max(180, geometry.size.height - 210))
                                    .frame(maxWidth: .infinity)
                                    .background(RootineTheme.ColorToken.surface, in: RoundedRectangle(cornerRadius: 16))
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .accessibilityIdentifier("calendar-inline-agenda")
                                }
                            }
                        }
                        .padding(.bottom, expanded ? geometry.size.height - 170 : 0)
                    }
                    .scrollIndicators(.hidden)
                    .id(expanded ? selectedWeek : -1)
                }
            }
        }
        .accessibilityIdentifier("calendar-month-grid")
    }
}

private struct CalendarWeekdayLabels: View {
    var body: some View {
        HStack(spacing: 0) {
            ForEach(["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"], id: \.self) { day in
                Text(day).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText).frame(maxWidth: .infinity)
            }
        }.frame(height: 32)
    }
}

private struct CalendarMonthCell: View {
    let day: Date
    let month: Date
    let tasks: [RootineCalendarOccurrence]
    let height: CGFloat
    var selectionActive = false
    var selected = false
    let onSelect: () -> Void
    private var isToday: Bool { CalendarLayout.calendar.isDateInToday(day) }
    private var inMonth: Bool { CalendarLayout.calendar.isDate(day, equalTo: month, toGranularity: .month) }
    private var capacity: Int { max(1, Int((height - 44) / 20) - 1) }
    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(CalendarLayout.calendar.component(.day, from: day))")
                    .font(.subheadline.weight(isToday ? .bold : .medium))
                    .foregroundStyle(selected ? .white : isToday && selectionActive ? RootineTheme.ColorToken.action : isToday ? .white : inMonth ? RootineTheme.ColorToken.primaryText : RootineTheme.ColorToken.secondaryText)
                    .frame(width: 30, height: 30)
                    .background(selected ? RootineTheme.ColorToken.action : isToday && selectionActive ? RootineTheme.ColorToken.primaryText : isToday ? RootineTheme.ColorToken.action : .clear, in: Circle())
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 3)
                ForEach(tasks.prefix(capacity)) { task in
                    Text(task.title).font(.system(size: 10, weight: .medium)).lineLimit(1)
                        .strikethrough(task.isDone)
                        .foregroundStyle(task.isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                        .padding(.horizontal, 3).frame(maxWidth: .infinity, minHeight: 17, alignment: .leading)
                        .background(calendarTaskColor(task).opacity(task.isDone ? 0.10 : 0.22), in: RoundedRectangle(cornerRadius: 4))
                }
                if tasks.count > capacity {
                    Text("+\(tasks.count - capacity)").font(.system(size: 10, weight: .medium))
                        .foregroundStyle(RootineTheme.ColorToken.secondaryText).padding(.leading, 3)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 2).padding(.top, 5)
            .frame(height: height, alignment: .top)
            .frame(maxWidth: .infinity)
            .background(selected ? RootineTheme.ColorToken.action.opacity(0.16) : inMonth ? Color.clear : RootineTheme.ColorToken.surface.opacity(0.35), in: RoundedRectangle(cornerRadius: 8))
            .overlay(alignment: .top) { Rectangle().fill(RootineTheme.ColorToken.separator).frame(height: 0.5) }
            .contentShape(Rectangle())
        }.buttonStyle(.plain)
        .accessibilityLabel("\(calendarLabel(day, format: "EEEE, d MMMM")), zadań: \(tasks.count)")
        .accessibilityIdentifier("calendar-date-\(RootineDate.localDate(day))")
    }
}

private struct CalendarYearGrid: View {
    let date: Date
    let occupiedDates: Set<String>
    let onSelect: (Date) -> Void
    var body: some View {
        let start = CalendarLayout.calendar.dateInterval(of: .year, for: date)!.start
        GeometryReader { geometry in
        let rowHeight = max(122, (geometry.size.height - 80) / 4)
        let dayHeight = (rowHeight - 53) / 6
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 3), alignment: .leading, spacing: 16) {
                ForEach(0..<12, id: \.self) { index in
                    let month = CalendarLayout.adding(.month, index, to: start)
                    Button { onSelect(month) } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(calendarLabel(month, format: "LLL")).font(.headline)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 1), count: 7), spacing: 5) {
                                ForEach(CalendarLayout.monthDays(month), id: \.self) { day in
                                    let inMonth = CalendarLayout.calendar.isDate(day, equalTo: month, toGranularity: .month)
                                    let today = CalendarLayout.calendar.isDateInToday(day)
                                    Text(inMonth ? "\(CalendarLayout.calendar.component(.day, from: day))" : "")
                                        .font(.system(size: 10, weight: occupiedDates.contains(RootineDate.localDate(day)) ? .bold : .regular))
                                        .frame(maxWidth: .infinity, minHeight: dayHeight)
                                        .foregroundStyle(today ? .white : RootineTheme.ColorToken.primaryText)
                                        .background(today ? RootineTheme.ColorToken.action : .clear, in: Circle())
                                }
                            }.frame(height: rowHeight - 30, alignment: .top)
                        }
                    }.buttonStyle(.plain)
                    .accessibilityLabel(calendarLabel(month, format: "LLLL yyyy"))
                }
            }.padding(16)
        }.accessibilityIdentifier("calendar-year-grid")
        }
    }
}

private struct CalendarTimeGrid: View {
    let days: [Date]
    let grouped: [String: [RootineCalendarOccurrence]]
    let onSelect: (RootineCalendarOccurrence) -> Void
    private let hourHeight: CGFloat = 64
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Color.clear.frame(width: 44, height: 60)
                ForEach(days, id: \.self) { day in
                    VStack(spacing: 6) {
                        Text(calendarLabel(day, format: "EE")).font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                        Text(calendarLabel(day, format: "d")).font(.headline).frame(width: 32, height: 32)
                            .foregroundStyle(CalendarLayout.calendar.isDateInToday(day) ? .white : RootineTheme.ColorToken.primaryText)
                            .background(CalendarLayout.calendar.isDateInToday(day) ? RootineTheme.ColorToken.action : .clear, in: Circle())
                    }.frame(maxWidth: .infinity)
                }
            }.padding(.bottom, 12)
            HStack(alignment: .top, spacing: 0) {
                Text("Bez\ngodz.").font(.system(size: 10)).foregroundStyle(RootineTheme.ColorToken.secondaryText).frame(width: 44, height: 32)
                ForEach(days, id: \.self) { day in
                    VStack(spacing: 3) {
                        ForEach((grouped[RootineDate.localDate(day)] ?? []).filter { $0.time == nil }) { item in
                            CalendarEventLabel(item: item, compact: days.count > 3, onSelect: onSelect)
                        }
                    }.frame(maxWidth: .infinity, minHeight: 32).padding(.horizontal, 2)
                }
            }.padding(.bottom, 8)
            ScrollViewReader { proxy in
                ScrollView {
                    HStack(alignment: .top, spacing: 0) {
                        VStack(spacing: 0) {
                            ForEach(0..<24, id: \.self) { hour in
                                Text(String(format: "%02d", hour)).font(.caption2).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                                    .frame(width: 44, height: hourHeight, alignment: .top).id(hour)
                            }
                        }
                        ForEach(days, id: \.self) { day in
                            CalendarHourColumn(day: day, tasks: grouped[RootineDate.localDate(day)] ?? [], hourHeight: hourHeight, compact: days.count > 3, onSelect: onSelect)
                        }
                    }.padding(.top, 8).padding(.bottom, 80)
                }
                .onAppear { proxy.scrollTo(7, anchor: .top) }
            }
        }.accessibilityIdentifier("calendar-time-grid")
    }
}

/// Assigns simultaneous events separate lanes; minimum visual height also counts as overlap.
struct CalendarEventPlacement: Identifiable {
    let item: RootineCalendarOccurrence
    let start: Int
    let end: Int
    let lane: Int
    var lanes: Int
    var id: String { item.id }
    static func layout(_ tasks: [RootineCalendarOccurrence]) -> [Self] {
        let timed = tasks.filter { $0.time != nil }.sorted { ($0.time ?? "") < ($1.time ?? "") }
        var result: [Self] = []
        var cluster: [Self] = []
        var laneEnds: [Int] = []
        func flush() {
            result += cluster.map { var value = $0; value.lanes = laneEnds.count; return value }
            cluster = []; laneEnds = []
        }
        for item in timed {
            let start = CalendarLayout.minutes(item.time) ?? 0
            let end = min(1440, max(start + 30, CalendarLayout.minutes(item.endTime) ?? start + 45))
            if !cluster.isEmpty && start >= (laneEnds.max() ?? 0) { flush() }
            let lane = laneEnds.firstIndex(where: { $0 <= start }) ?? laneEnds.count
            if lane == laneEnds.count { laneEnds.append(end) } else { laneEnds[lane] = end }
            cluster.append(Self(item: item, start: start, end: end, lane: lane, lanes: 1))
        }
        flush()
        return result
    }
}

private struct CalendarHourColumn: View {
    let day: Date
    let tasks: [RootineCalendarOccurrence]
    let hourHeight: CGFloat
    let compact: Bool
    let onSelect: (RootineCalendarOccurrence) -> Void
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                VStack(spacing: 0) {
                    ForEach(0..<24, id: \.self) { _ in
                        Rectangle().fill(RootineTheme.ColorToken.separator).frame(height: 0.5)
                            .frame(height: hourHeight, alignment: .top)
                    }
                }
                Rectangle().fill(RootineTheme.ColorToken.separator).frame(width: 0.5)
                ForEach(CalendarEventPlacement.layout(tasks)) { placement in
                    let width = geometry.size.width / CGFloat(placement.lanes)
                    CalendarEventLabel(item: placement.item, compact: compact, onSelect: onSelect)
                        .frame(width: max(1, width - 4), height: CGFloat(placement.end - placement.start) / 60 * hourHeight - 2, alignment: .top)
                        .background(calendarTaskColor(placement.item).opacity(0.10), in: RoundedRectangle(cornerRadius: 5))
                        .offset(x: CGFloat(placement.lane) * width + 2, y: CGFloat(placement.start) / 60 * hourHeight)
                }
                if CalendarLayout.calendar.isDateInToday(day) {
                    TimelineView(.periodic(from: .now, by: 60)) { context in
                        let parts = CalendarLayout.calendar.dateComponents([.hour, .minute], from: context.date)
                        let minute = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
                        Rectangle().fill(RootineTheme.ColorToken.destructive).frame(height: 1)
                            .overlay(alignment: .leading) { Circle().fill(RootineTheme.ColorToken.destructive).frame(width: 5, height: 5) }
                            .offset(y: CGFloat(minute) / 60 * hourHeight)
                    }.allowsHitTesting(false)
                }
            }
        }.frame(maxWidth: .infinity).frame(height: hourHeight * 24)
    }
}

private struct CalendarEventLabel: View {
    let item: RootineCalendarOccurrence
    let compact: Bool
    let onSelect: (RootineCalendarOccurrence) -> Void
    var body: some View {
        Button { onSelect(item) } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.system(size: compact ? 10 : 12, weight: .medium)).lineLimit(2).strikethrough(item.isDone)
                if !compact, let time = item.time { Text(time).font(.system(size: 10)) }
            }
            .foregroundStyle(item.isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
            .padding(4).frame(maxWidth: .infinity, alignment: .leading)
            .background(calendarTaskColor(item).opacity(item.isDone ? 0.10 : 0.24), in: RoundedRectangle(cornerRadius: 5))
        }.buttonStyle(.plain)
        .accessibilityLabel("\(item.title), \(item.time ?? "Bez godziny")\(item.isDone ? ", ukończone" : "")")
    }
}

private struct CalendarAgendaRows: View {
    @EnvironmentObject private var environment: AppEnvironment
    let tasks: [RootineCalendarOccurrence]
    let onSelect: (RootineCalendarOccurrence) -> Void
    let onToggle: (RootineCalendarOccurrence) -> Void
    var body: some View {
        VStack(spacing: 0) {
            ForEach(tasks) { item in
                HStack(spacing: 8) {
                    Button { onToggle(item) } label: {
                        Image(systemName: item.isDone ? "checkmark.square.fill" : "square")
                            .font(.title3).foregroundStyle(calendarTaskColor(item)).frame(width: 44, height: 48)
                    }.buttonStyle(.plain)
                    .accessibilityLabel("\(item.isDone ? "Cofnij ukończenie" : "Ukończ"): \(item.title)")
                    Button { onSelect(item) } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(item.title).font(.body).strikethrough(item.isDone)
                                .foregroundStyle(item.isDone ? RootineTheme.ColorToken.secondaryText : RootineTheme.ColorToken.primaryText)
                            HStack(spacing: 6) {
                                Text(calendarRelativeDay(RootineDate.localDateValue(item.calendarDate) ?? Date()) + (item.time.map { ", \($0)" } ?? ""))
                                    .foregroundStyle(calendarTaskColor(item))
                                if item.task.schedule?.reminderMinutes != nil { Image(systemName: "alarm").foregroundStyle(RootineTheme.ColorToken.secondaryText) }
                                Spacer(minLength: 4)
                                Text(environment.taskWorkspace.lists.first(where: { $0.id == item.task.list })?.label ?? "Skrzynka zadań")
                                    .foregroundStyle(RootineTheme.ColorToken.secondaryText).lineLimit(1)
                            }.font(.caption)
                        }.frame(maxWidth: .infinity, minHeight: 60, alignment: .leading).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
                if item.id != tasks.last?.id { Divider() }
            }
        }
    }
}

struct CalendarScheduleDraft: Equatable {
    var date: Date
    var hasDate = true
    var allDay = true
    var startMinutes = 9 * 60
    var endMinutes = 10 * 60
    var reminder = -1
    var recurrence = ""
    var isValid: Bool { !hasDate || allDay || endMinutes > startMinutes }
    var schedule: WorkspaceTaskSchedule? {
        guard hasDate else { return nil }
        return WorkspaceTaskSchedule(allDay: allDay, startTime: allDay ? "" : Self.clock(startMinutes),
            endTime: allDay ? nil : Self.clock(endMinutes), reminderMinutes: reminder < 0 ? nil : reminder,
            recurrence: recurrence.isEmpty ? nil : recurrence, timezone: TimeZone.current.identifier)
    }
    static func clock(_ minutes: Int) -> String { String(format: "%02d:%02d", minutes / 60, minutes % 60) }
    mutating func clear() { hasDate = false; allDay = true; reminder = -1; recurrence = "" }
}

/// Shared quick task entry for Today and Calendar; the caller supplies the initial day.
struct TaskComposerSheet: View {
    @EnvironmentObject private var environment: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var draft: CalendarScheduleDraft
    @State private var priority = ""
    @State private var list = ""
    @State private var tags: Set<String> = []
    @State private var notes = ""
    @State private var showSchedule = false
    @State private var showNotes = false
    @State private var saving = false
    @State private var error: String?
    @State private var operationID = UUID().uuidString
    @FocusState private var titleFocused: Bool

    init(date: Date) { _draft = State(initialValue: CalendarScheduleDraft(date: date)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Co chciałbyś zrobić?", text: $title, axis: .vertical)
                .font(.body).lineLimit(2...4).focused($titleFocused)
                .accessibilityIdentifier("calendar-task-title")
            if let error { Text(error).font(.caption).foregroundStyle(RootineTheme.ColorToken.destructive) }
            Spacer(minLength: 0)
            HStack(spacing: 2) {
                Button {
                    titleFocused = false
                    showSchedule = true
                } label: {
                    Label(draft.hasDate ? calendarRelativeDay(draft.date) : "Data", systemImage: "calendar")
                        .font(.subheadline.weight(.medium)).lineLimit(1).frame(minHeight: 44)
                }.accessibilityIdentifier("calendar-task-date")
                Menu {
                    Section("Priorytet zadania") {
                    Picker("Priorytet", selection: $priority) {
                        Text("Brak").tag(""); Text("Wysoki").tag("high"); Text("Średni").tag("medium"); Text("Niski").tag("low")
                    }
                    }
                } label: { composerIcon(priority.isEmpty ? "flag" : "flag.fill", active: !priority.isEmpty) }
                    .accessibilityLabel("Priorytet")
                    .accessibilityValue(["high": "Wysoki", "medium": "Średni", "low": "Niski"][priority] ?? "Brak")
                Menu {
                    Section("Tagi zadania") {
                    if environment.taskWorkspace.tags.isEmpty { Text("Brak utworzonych tagów") }
                    ForEach(environment.taskWorkspace.tags, id: \.id) { tag in
                        Button {
                            if tags.contains(tag.id) { tags.remove(tag.id) } else { tags.insert(tag.id) }
                        } label: { Label(tag.label, systemImage: tags.contains(tag.id) ? "checkmark" : "tag") }
                    }
                    }
                } label: { composerIcon(tags.isEmpty ? "tag" : "tag.fill", active: !tags.isEmpty) }
                    .accessibilityLabel("Tagi")
                    .accessibilityValue(tags.isEmpty ? "Brak" : environment.taskWorkspace.tags.filter { tags.contains($0.id) }.map(\.label).joined(separator: ", "))
                Menu {
                    Section("Lista zadań") {
                    Picker("Lista", selection: $list) {
                        Text("Skrzynka zadań").tag("")
                        ForEach(environment.taskWorkspace.lists, id: \.id) { Text($0.label).tag($0.id) }
                    }
                    }
                } label: { composerIcon("tray", active: !list.isEmpty) }.accessibilityLabel("Lista")
                    .accessibilityValue(environment.taskWorkspace.lists.first(where: { $0.id == list })?.label ?? "Skrzynka zadań")
                Button { titleFocused = false; showNotes = true } label: { composerIcon("note.text", active: !notes.isEmpty) }
                    .accessibilityLabel("Notatka do zadania")
                Spacer(minLength: 0)
                Button { Task { await save() } } label: {
                    Image(systemName: "arrow.up").font(.headline).foregroundStyle(.white)
                        .frame(width: 36, height: 36).background(RootineTheme.ColorToken.action, in: Circle())
                }.frame(width: 44, height: 44).accessibilityLabel("Dodaj zadanie")
                    .accessibilityIdentifier("calendar-task-save")
                    .disabled(saving || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .opacity(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.4 : 1)
            }
        }
        .padding(.horizontal, 16).padding(.top, 24).padding(.bottom, 8)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(RootineTheme.ColorToken.surface)
        .presentationDetents([.height(error == nil ? 156 : 192)])
        .presentationDragIndicator(.visible)
        .presentationBackground(RootineTheme.ColorToken.surface)
        .interactiveDismissDisabled(saving)
        .task { titleFocused = true }
        .sheet(isPresented: $showSchedule, onDismiss: { titleFocused = true }) {
            CalendarScheduleEditor(initial: draft) { draft = $0 }
        }
        .sheet(isPresented: $showNotes, onDismiss: { titleFocused = true }) {
            NavigationStack {
                TextEditor(text: $notes).padding().navigationTitle("Notatka").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gotowe") { showNotes = false } } }
            }.presentationDetents([.medium, .large])
        }
    }
    private func composerIcon(_ icon: String, active: Bool) -> some View {
        Image(systemName: icon).font(.system(size: 18))
            .foregroundStyle(active ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.secondaryText)
            .frame(width: 38, height: 44)
    }
    private func save() async {
        guard draft.isValid else { error = "Godzina zakończenia musi być późniejsza niż rozpoczęcia."; return }
        saving = true
        defer { saving = false }
        let key = draft.hasDate ? RootineDate.localDate(draft.date) : nil
        await environment.addTask(text: title, time: draft.allDay ? nil : CalendarScheduleDraft.clock(draft.startMinutes),
            calendarDate: key, view: draft.hasDate ? "dzis" : "wszystkie",
            priority: TaskPriority(rawValue: priority), operationID: operationID, schedule: draft.schedule,
            list: list.isEmpty ? nil : list, tags: tags.sorted(), notes: notes)
        let id = RootineLocalIdentifier.integer(namespace: "task", operationID: operationID)
        if environment.taskWorkspace.tasks.contains(where: { $0.id == id }) { dismiss() }
        else { error = "Nie udało się zapisać zadania. Spróbuj ponownie." }
    }
}

private struct CalendarScheduleEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft: CalendarScheduleDraft
    @State private var month: Date
    @State private var tab = 0
    @State private var showTime = false
    let onSave: (CalendarScheduleDraft) -> Void

    init(initial: CalendarScheduleDraft, onSave: @escaping (CalendarScheduleDraft) -> Void) {
        _draft = State(initialValue: initial)
        _month = State(initialValue: initial.date)
        self.onSave = onSave
    }
    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 12) {
                Button { dismiss() } label: { Image(systemName: "xmark").font(.title3).frame(width: 44, height: 44).background(RootineTheme.ColorToken.elevated, in: Circle()) }
                    .accessibilityLabel("Anuluj termin")
                Picker("Ustawienia terminu", selection: $tab) {
                    Text("Data").tag(0); Text("Czas trwania").tag(1)
                }.pickerStyle(.segmented)
                Button { onSave(draft); dismiss() } label: {
                    Image(systemName: "checkmark").font(.title3.weight(.semibold)).foregroundStyle(.white)
                        .frame(width: 44, height: 44).background(RootineTheme.ColorToken.action, in: Circle())
                }.accessibilityLabel("Zatwierdź termin").disabled(!draft.isValid)
            }
            ScrollView {
                VStack(spacing: 16) {
                    if tab == 0 { datePanel } else { durationPanel }
                    if showTime && !draft.allDay {
                        VStack(spacing: 8) {
                            DatePicker("Początek", selection: clockBinding(end: false), displayedComponents: .hourAndMinute)
                            DatePicker("Koniec", selection: clockBinding(end: true), displayedComponents: .hourAndMinute)
                        }.padding(16).background(RootineTheme.ColorToken.elevated, in: RoundedRectangle(cornerRadius: 16))
                    }
                    scheduleOptions
                    if !draft.isValid {
                        Text("Godzina zakończenia musi być późniejsza niż rozpoczęcia.")
                            .font(.caption).foregroundStyle(RootineTheme.ColorToken.destructive)
                    }
                }
            }.scrollIndicators(.hidden)
            Button("Wyczyść", role: .destructive) { draft.clear(); onSave(draft); dismiss() }
                .frame(minHeight: 44).accessibilityIdentifier("calendar-schedule-clear")
        }
        .padding(16).padding(.top, 8)
        .background(RootineTheme.ColorToken.surface)
        .environment(\.locale, Locale(identifier: "pl_PL"))
        .presentationDetents([.fraction(0.85), .large])
        .presentationDragIndicator(.hidden)
        .presentationBackground(RootineTheme.ColorToken.surface)
    }
    private var datePanel: some View {
        VStack(spacing: 8) {
            HStack {
                Button { month = CalendarLayout.adding(.month, -1, to: month) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("Poprzedni miesiąc")
                Spacer()
                Text(calendarLabel(month, format: "LLLL yyyy")).font(.headline)
                Spacer()
                Button { month = CalendarLayout.adding(.month, 1, to: month) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel("Następny miesiąc")
            }
            CalendarWeekdayLabels()
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 0) {
                ForEach(CalendarLayout.monthDays(month), id: \.self) { day in
                    let inMonth = CalendarLayout.calendar.isDate(day, equalTo: month, toGranularity: .month)
                    let selected = draft.hasDate && CalendarLayout.calendar.isDate(day, inSameDayAs: draft.date)
                    let today = CalendarLayout.calendar.isDateInToday(day)
                    Button { draft.date = day; draft.hasDate = true } label: {
                        Text("\(CalendarLayout.calendar.component(.day, from: day))")
                            .font(.subheadline.weight(selected || today ? .semibold : .regular))
                            .foregroundStyle(selected ? .white : today ? RootineTheme.ColorToken.action : RootineTheme.ColorToken.primaryText)
                            .frame(width: 32, height: 32)
                            .background(selected ? RootineTheme.ColorToken.action : today ? RootineTheme.ColorToken.elevated : .clear, in: Circle())
                            .frame(maxWidth: .infinity, minHeight: 40).contentShape(Rectangle())
                    }.buttonStyle(.plain).opacity(inMonth ? 1 : 0)
                        .disabled(!inMonth).accessibilityHidden(!inMonth)
                        .accessibilityLabel(calendarLabel(day, format: "d MMMM yyyy"))
                        .accessibilityIdentifier("schedule-date-\(RootineDate.localDate(day))")
                }
            }
        }
    }
    private var durationPanel: some View {
        VStack(spacing: 12) {
            HStack(alignment: .top, spacing: 8) {
                Button { tab = 0 } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Data").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.primaryText)
                        Text(draft.hasDate ? calendarLabel(draft.date, format: "d MMM, EE") : "Brak").font(.headline)
                        Text(draft.hasDate ? calendarRelativeDay(draft.date) : "Wybierz datę").font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }.frame(maxWidth: .infinity, minHeight: 90, alignment: .leading).padding(12)
                        .background(RootineTheme.ColorToken.elevated, in: RoundedRectangle(cornerRadius: 16))
                }.buttonStyle(.plain)
                Button { draft.hasDate = true; draft.allDay = false; showTime.toggle() } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Czas").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.primaryText)
                        Text(draft.allDay ? "Cały dzień" : "\(CalendarScheduleDraft.clock(draft.startMinutes)) – \(CalendarScheduleDraft.clock(draft.endMinutes))")
                            .font(.headline).minimumScaleFactor(0.8).lineLimit(1)
                        Text(draft.allDay ? "Bez godziny" : "\(max(0, draft.endMinutes - draft.startMinutes)) min").font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
                    }.frame(maxWidth: .infinity, minHeight: 90, alignment: .leading).padding(12)
                        .background(RootineTheme.ColorToken.elevated, in: RoundedRectangle(cornerRadius: 16))
                }.buttonStyle(.plain).accessibilityLabel("Zmień czas trwania")
            }.foregroundStyle(RootineTheme.ColorToken.action)
            Toggle("Cały dzień", isOn: $draft.allDay).padding(16)
                .background(RootineTheme.ColorToken.elevated, in: RoundedRectangle(cornerRadius: 16))
                .onChange(of: draft.allDay) { _, value in if !value { draft.hasDate = true } else { showTime = false } }
            Text(TimeZone.current.identifier.replacingOccurrences(of: "_", with: " ") + " · " + (TimeZone.current.abbreviation() ?? ""))
                .font(.caption).foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }
    }
    private var scheduleOptions: some View {
        VStack(spacing: 0) {
            if tab == 0 {
                Menu {
                    Button("Brak") { draft.allDay = true; showTime = false }
                    Button("Ustaw godzinę") { draft.hasDate = true; draft.allDay = false; showTime = true }
                } label: {
                    optionRow("Czas", icon: "clock", value: draft.allDay ? "Brak" : CalendarScheduleDraft.clock(draft.startMinutes))
                }.accessibilityIdentifier("calendar-schedule-time")
            }
            Menu {
                Picker("Przypomnienie", selection: $draft.reminder) {
                    Text("Brak").tag(-1); Text("O godzinie zadania").tag(0)
                    Text("5 min wcześniej").tag(5); Text("15 min wcześniej").tag(15); Text("1 godz. wcześniej").tag(60)
                }
            } label: {
                optionRow("Przypomnienie", icon: "alarm", value: draft.reminder < 0 ? "Brak" : draft.reminder == 0 ? "O godzinie" : "\(draft.reminder) min przed")
            }
            Menu {
                Picker("Powtarzaj", selection: $draft.recurrence) {
                    Text("Brak").tag(""); Text("Codziennie").tag("daily"); Text("Co tydzień").tag("weekly")
                    Text("Co miesiąc").tag("monthly"); Text("Co rok").tag("yearly")
                }
            } label: {
                optionRow("Powtarzaj", icon: "repeat", value: ["daily": "Codziennie", "weekly": "Co tydzień", "monthly": "Co miesiąc", "yearly": "Co rok"][draft.recurrence] ?? "Brak")
            }
        }
        .background(RootineTheme.ColorToken.elevated, in: RoundedRectangle(cornerRadius: 16))
    }
    private func optionRow(_ title: String, icon: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).frame(width: 24)
            Text(title)
            Spacer(minLength: 4)
            Text(value).font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
            Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(RootineTheme.ColorToken.secondaryText)
        }.foregroundStyle(RootineTheme.ColorToken.primaryText).padding(.horizontal, 16).frame(minHeight: 52)
    }
    private func clockBinding(end: Bool) -> Binding<Date> {
        Binding {
            let minutes = end ? draft.endMinutes : draft.startMinutes
            return CalendarLayout.calendar.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: draft.date) ?? draft.date
        } set: { value in
            let parts = CalendarLayout.calendar.dateComponents([.hour, .minute], from: value)
            let minutes = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
            if end { draft.endMinutes = minutes } else { draft.startMinutes = minutes }
        }
    }
}

private func calendarRelativeDay(_ date: Date) -> String {
    if CalendarLayout.calendar.isDateInToday(date) { return "Dzisiaj" }
    if CalendarLayout.calendar.isDateInTomorrow(date) { return "Jutro" }
    if CalendarLayout.calendar.isDateInYesterday(date) { return "Wczoraj" }
    return calendarLabel(date, format: "d MMM")
}

private var calendarEmptyState: some View {
    VStack(alignment: .leading, spacing: 8) {
        Text("Brak zadań w tym widoku").font(.headline)
        Text("Dodaj zadanie przyciskiem + lub zmień datę i filtry.").font(.subheadline).foregroundStyle(RootineTheme.ColorToken.secondaryText)
    }.padding(.vertical, 24)
}
private func calendarTaskColor(_ task: RootineCalendarOccurrence) -> Color {
    if task.isDone { return RootineTheme.ColorToken.success }
    if task.calendarDate < RootineDate.localDate() { return RootineTheme.ColorToken.warning }
    return RootineTheme.ColorToken.action
}
private func calendarLabel(_ date: Date, format: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "pl_PL")
    formatter.dateFormat = format
    let text = formatter.string(from: date)
    return text.prefix(1).uppercased() + text.dropFirst()
}
private func calendarClock(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
}
