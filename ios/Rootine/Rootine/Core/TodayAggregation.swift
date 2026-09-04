import Foundation

/// The domain order used by Today is a contract, not an implementation detail.
/// Keeping it here makes every consumer (Today, notifications and future
/// widgets) render the same deterministic order.
enum TodayDomain: String, CaseIterable, Codable, Hashable, Sendable {
    case tasks
    case habits
    case nutrition
    case notes
    case sport
    case goals
    case work
    case travel
    case health
    case affairs

    var title: String {
        switch self {
        case .tasks: return "Zadania"
        case .habits: return "Nawyki"
        case .nutrition: return "Odżywianie"
        case .notes: return "Notatki"
        case .sport: return "Sport"
        case .goals: return "Cele"
        case .work: return "Praca"
        case .travel: return "Podróże"
        case .health: return "Zdrowie"
        case .affairs: return "Sprawy"
        }
    }

    /// Informational domains are useful in the Today register but must not
    /// inflate the completion balance. They still have a complete summary.
    var countsTowardDayBalance: Bool {
        switch self {
        case .tasks, .habits, .nutrition, .sport, .work, .health, .affairs:
            return true
        case .notes, .goals, .travel:
            return false
        }
    }
}

struct TodayDayBoundary: Equatable, Sendable {
    let dateKey: String
    let start: Date
    let end: Date
    let timeZoneIdentifier: String

    init(date: Date, calendar inputCalendar: Calendar = .current) {
        let calendar = inputCalendar
        let start = calendar.startOfDay(for: date)
        self.dateKey = RootineDate.localDate(start, calendar: calendar)
        self.start = start
        self.end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
        self.timeZoneIdentifier = calendar.timeZone.identifier
    }

    func contains(_ date: Date) -> Bool {
        start <= date && date < end
    }
}

enum TodayDomainLoadState: String, Codable, Equatable, Sendable {
    case fresh
    case stale
    case failed
    case unavailable
}

struct TodayDomainStatus: Codable, Equatable, Sendable {
    let state: TodayDomainLoadState
    let message: String?
    let updatedAt: String?
    let isCached: Bool

    init(
        state: TodayDomainLoadState,
        message: String? = nil,
        updatedAt: String? = nil,
        isCached: Bool = false
    ) {
        self.state = state
        self.message = message
        self.updatedAt = updatedAt
        self.isCached = isCached
    }

    static let fresh = TodayDomainStatus(state: .fresh)

    static func stale(
        message: String? = "Pokazuję ostatnie dane zapisane na tym iPhonie.",
        updatedAt: String? = nil
    ) -> TodayDomainStatus {
        TodayDomainStatus(state: .stale, message: message, updatedAt: updatedAt, isCached: true)
    }

    static func failed(_ message: String) -> TodayDomainStatus {
        TodayDomainStatus(state: .failed, message: message)
    }

    static func unavailable(_ message: String? = nil) -> TodayDomainStatus {
        TodayDomainStatus(state: .unavailable, message: message)
    }

    var isDegraded: Bool { state != .fresh }
}

struct TodayQueueItem: Identifiable, Equatable, Sendable {
    enum Kind: String, Codable, Equatable, Sendable {
        case task
        case habit
        case workout
        case workTask
        case reminder
        case affair
    }

    let id: String
    let domain: TodayDomain
    let entityID: String
    let title: String
    let dateKey: String
    let time: String?
    let kind: Kind
    let isCompleted: Bool
    let isOverdue: Bool
    let priority: TaskPriority?
    let task: WorkspaceTask?
    let habit: WorkspaceHabit?

    init(
        id: String,
        domain: TodayDomain,
        entityID: String,
        title: String,
        dateKey: String,
        time: String? = nil,
        kind: Kind,
        isCompleted: Bool,
        isOverdue: Bool = false,
        priority: TaskPriority? = nil,
        task: WorkspaceTask? = nil,
        habit: WorkspaceHabit? = nil
    ) {
        self.id = id
        self.domain = domain
        self.entityID = entityID
        self.title = title
        self.dateKey = dateKey
        self.time = time
        self.kind = kind
        self.isCompleted = isCompleted
        self.isOverdue = isOverdue
        self.priority = priority
        self.task = task
        self.habit = habit
    }
}

struct TodayDomainSummary: Identifiable, Equatable, Sendable {
    let domain: TodayDomain
    let total: Int
    let completed: Int
    let remaining: Int
    let overdue: Int
    let priorityTotal: Int
    let priorityCompleted: Int
    let metric: String?
    let status: TodayDomainStatus
    let countsTowardDayBalance: Bool

    var id: TodayDomain { domain }
    var isEmpty: Bool { total == 0 && metric == nil }
    var progress: Double {
        guard total > 0 else { return 0 }
        return min(1, max(0, Double(completed) / Double(total)))
    }

    init(
        domain: TodayDomain,
        total: Int,
        completed: Int,
        overdue: Int = 0,
        priorityTotal: Int = 0,
        priorityCompleted: Int = 0,
        metric: String? = nil,
        status: TodayDomainStatus = .fresh
    ) {
        self.domain = domain
        self.total = max(0, total)
        self.completed = min(max(0, completed), max(0, total))
        self.remaining = max(0, total - self.completed)
        self.overdue = max(0, overdue)
        self.priorityTotal = max(0, priorityTotal)
        self.priorityCompleted = min(max(0, priorityCompleted), max(0, priorityTotal))
        self.metric = metric
        self.status = status
        self.countsTowardDayBalance = domain.countsTowardDayBalance
    }
}

struct TodayAggregationInput: Sendable {
    let accountID: String
    let referenceDate: Date
    let calendar: Calendar
    let taskWorkspace: TaskWorkspace
    let nutritionWorkspace: NutritionWorkspace
    let notesWorkspace: NotesWorkspace
    let sportWorkspace: SportWorkspace
    let goalsWorkspace: GoalsWorkspace
    let workWorkspace: WorkWorkspace
    let travelWorkspace: TravelWorkspace
    let healthWorkspace: HealthWorkspace
    let affairsWorkspace: AffairsWorkspace
    let statuses: [TodayDomain: TodayDomainStatus]

    init(
        accountID: String,
        referenceDate: Date = Date(),
        calendar: Calendar = .current,
        taskWorkspace: TaskWorkspace = .empty,
        nutritionWorkspace: NutritionWorkspace = .empty,
        notesWorkspace: NotesWorkspace = .empty,
        sportWorkspace: SportWorkspace = .empty,
        goalsWorkspace: GoalsWorkspace = .empty,
        workWorkspace: WorkWorkspace = .empty,
        travelWorkspace: TravelWorkspace = .empty,
        healthWorkspace: HealthWorkspace = .empty,
        affairsWorkspace: AffairsWorkspace = .empty,
        statuses: [TodayDomain: TodayDomainStatus] = [:]
    ) {
        self.accountID = accountID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.referenceDate = referenceDate
        self.calendar = calendar
        self.taskWorkspace = taskWorkspace
        self.nutritionWorkspace = nutritionWorkspace
        self.notesWorkspace = notesWorkspace
        self.sportWorkspace = sportWorkspace
        self.goalsWorkspace = goalsWorkspace
        self.workWorkspace = workWorkspace
        self.travelWorkspace = travelWorkspace
        self.healthWorkspace = healthWorkspace
        self.affairsWorkspace = affairsWorkspace
        self.statuses = statuses
    }
}

struct TodayAggregation: Equatable, Sendable {
    let accountID: String
    let boundary: TodayDayBoundary
    let summaries: [TodayDomain: TodayDomainSummary]
    let todayTasks: [WorkspaceTask]
    let overdueTasks: [WorkspaceTask]
    let todayHabits: [WorkspaceHabit]
    let nutritionDay: NutritionDay?
    let notes: [NoteRecord]
    let queue: [TodayQueueItem]
    let now: TodayQueueItem?
    let next: [TodayQueueItem]

    var orderedSummaries: [TodayDomainSummary] {
        TodayDomain.allCases.compactMap { summaries[$0] }
    }

    var overdueItems: [TodayQueueItem] { queue.filter(\.isOverdue) }

    var totalDailyItems: Int {
        summaries.values
            .filter(\.countsTowardDayBalance)
            .reduce(0) { $0 + $1.total }
    }

    var completedDailyItems: Int {
        summaries.values
            .filter(\.countsTowardDayBalance)
            .reduce(0) { $0 + $1.completed }
    }

    var remainingDailyItems: Int { max(0, totalDailyItems - completedDailyItems) }

    var priorityTotal: Int {
        summaries.values.reduce(0) { $0 + $1.priorityTotal }
    }

    var priorityCompleted: Int {
        summaries.values.reduce(0) { $0 + $1.priorityCompleted }
    }

    var progress: Double {
        guard totalDailyItems > 0 else { return 0 }
        return min(1, Double(completedDailyItems) / Double(totalDailyItems))
    }

    var degradedDomains: [TodayDomain] {
        orderedSummaries.filter { $0.status.isDegraded }.map(\.domain)
    }
}

enum TodayAggregationService {
    static func aggregate(_ input: TodayAggregationInput) -> TodayAggregation {
        let boundary = TodayDayBoundary(date: input.referenceDate, calendar: input.calendar)
        let status = StatusLookup(input.statuses)
        let todayKey = boundary.dateKey
        let calendar = input.calendar

        let allTasks = uniqueTasks(input.taskWorkspace.tasks)
        let todayTasks = allTasks
            .filter { task in
                task.deleted != true
                    && task.source?.kind != "work"
                    && taskIsForToday(task, todayKey: todayKey)
            }
            .sorted(by: taskSort)
        let overdueTasks = allTasks
            .filter { task in
                task.deleted != true
                    && task.source?.kind != "work"
                    && !rootineTaskIsDoneOnDate(task, dateKey: todayKey)
                    && validDateKey(task.calendarDate).map { $0 < todayKey } == true
            }
            .sorted(by: taskSort)
        let todayTaskBuckets = partition(todayTasks) { rootineTaskIsDoneOnDate($0, dateKey: todayKey) }
        let completedTodayTasks = todayTaskBuckets.matching
        let openTodayTasks = todayTaskBuckets.other

        let todayHabits = uniqueHabits(input.taskWorkspace.habits)
            .filter { rootineHabitIsScheduledOnDate($0, dateKey: todayKey, calendar: calendar) }
            .sorted(by: habitSort)
        let todayHabitBuckets = partition(todayHabits) { rootineHabitIsDoneOnDate($0, dateKey: todayKey) }
        let completedTodayHabits = todayHabitBuckets.matching
        let openTodayHabits = todayHabitBuckets.other

        let workTasks = allTasks
            .filter { task in
                task.deleted != true
                    && task.source?.kind == "work"
                    && validDateKey(task.calendarDate).map { $0 <= todayKey } == true
            }
            .sorted(by: taskSort)
        let workDueToday = workTasks.filter { validDateKey($0.calendarDate) == todayKey }
        let workTaskBuckets = partition(workTasks) { rootineTaskIsDoneOnDate($0, dateKey: todayKey) }
        let completedWorkDueToday = workTaskBuckets.matching.filter { validDateKey($0.calendarDate) == todayKey }
        let openWorkTasks = workTaskBuckets.other
        let overdueWorkTasks = openWorkTasks.filter {
            validDateKey($0.calendarDate).map { $0 < todayKey } == true
        }

        let nutritionDay = input.nutritionWorkspace.days[todayKey]
        let nutritionEntries = nutritionDay.map(uniqueNutritionEntries) ?? []
        let nutritionCompleted = nutritionDay?.closedAt != nil
        let nutritionCalories = nutritionEntries.reduce(0) { $0 + $1.calories }

        let uniqueNotes = uniqueNotes(input.notesWorkspace.notes)
        let activeNotes = uniqueNotes.filter { !$0.archived }
        let updatedNotes = activeNotes.filter {
            timestamp($0.updatedAt, isInside: boundary, calendar: calendar)
        }

        let sportWorkouts = uniqueWorkouts(input.sportWorkspace.workouts)
        let todayWorkouts = sportWorkouts
            .filter { localDateKey($0.date, calendar: calendar) == todayKey }
            .sorted(by: workoutSort)
        let completedWorkouts = todayWorkouts.filter(\.completed)

        let goals = uniqueGoals(input.goalsWorkspace.goals)
        let completedGoals = goals.filter { $0.target > 0 && $0.current >= $0.target }
        let averageGoalProgress = goals.isEmpty
            ? nil
            : goals.reduce(0) { $0 + $1.progress } / Double(goals.count)

        let focusSessions = uniqueFocusSessions(input.workWorkspace.focusSessions)
        let focusSessionsToday = focusSessions.filter {
            timestamp($0.endedAt, isInside: boundary, calendar: calendar)
        }
        let activeFocus = input.workWorkspace.activeFocusStartedAt.map {
            timestamp($0, isInside: boundary, calendar: calendar)
        } ?? false

        let trips = uniqueTrips(input.travelWorkspace.trips)

        let reminders = uniqueHealthReminders(input.healthWorkspace.reminders)
        let completedReminders = reminders.filter {
            $0.completedDates.contains(todayKey)
        }
        let energyMetric = input.healthWorkspace.checkIns[todayKey].map {
            "Energia \(min(4, max(1, $0.energy)))/4"
        }

        let affairs = datedAffairs(input.affairsWorkspace, todayKey: todayKey)
        let affairCompleted = affairs.filter(\.completed)
        // Completed matters/payments remain in the daily total so closing an
        // item moves the balance rather than making the item disappear from
        // the day's denominator. Only open records enter the action queue.
        let dueAffairs = affairs.filter { $0.dateKey <= todayKey }
        let actionableAffairs = dueAffairs.filter { !$0.completed }
        let overdueAffairs = actionableAffairs.filter { $0.dateKey < todayKey }

        var summaries: [TodayDomain: TodayDomainSummary] = [:]
        summaries[.tasks] = TodayDomainSummary(
            domain: .tasks,
            total: todayTasks.count + overdueTasks.count,
            completed: completedTodayTasks.count,
            overdue: overdueTasks.count,
            priorityTotal: (todayTasks + overdueTasks).filter { $0.priority != nil }.count,
            priorityCompleted: completedTodayTasks.filter { $0.priority != nil }.count,
            status: status.forDomain(.tasks)
        )
        summaries[.habits] = TodayDomainSummary(
            domain: .habits,
            total: todayHabits.count,
            completed: completedTodayHabits.count,
            priorityTotal: todayHabits.filter { $0.priority != nil }.count,
            priorityCompleted: completedTodayHabits.filter { $0.priority != nil }.count,
            status: status.forDomain(.habits)
        )
        summaries[.nutrition] = TodayDomainSummary(
            domain: .nutrition,
            total: nutritionDay == nil ? 0 : 1,
            completed: nutritionCompleted ? 1 : 0,
            metric: nutritionDay == nil ? nil : "\(formatNumber(nutritionCalories)) kcal",
            status: status.forDomain(.nutrition)
        )
        summaries[.notes] = TodayDomainSummary(
            domain: .notes,
            total: activeNotes.count,
            completed: 0,
            metric: activeNotes.isEmpty ? nil : "\(updatedNotes.count) zmienionych dzisiaj",
            status: status.forDomain(.notes)
        )
        summaries[.sport] = TodayDomainSummary(
            domain: .sport,
            total: todayWorkouts.count,
            completed: completedWorkouts.count,
            metric: todayWorkouts.isEmpty ? nil : "\(todayWorkouts.reduce(0) { $0 + $1.minutes }) min",
            status: status.forDomain(.sport)
        )
        summaries[.goals] = TodayDomainSummary(
            domain: .goals,
            total: goals.count,
            completed: completedGoals.count,
            metric: averageGoalProgress.map { "\(Int(($0 * 100).rounded()))% średniego postępu" },
            status: status.forDomain(.goals)
        )
        summaries[.work] = TodayDomainSummary(
            domain: .work,
            total: workDueToday.count + overdueWorkTasks.count,
            completed: completedWorkDueToday.count,
            overdue: overdueWorkTasks.count,
            priorityTotal: (workDueToday + overdueWorkTasks).filter { $0.priority != nil }.count,
            priorityCompleted: completedWorkDueToday.filter { $0.priority != nil }.count,
            metric: focusSessionsToday.isEmpty && !activeFocus ? nil : "\(focusSessionsToday.count) sesji skupienia",
            status: status.forDomain(.work)
        )
        summaries[.travel] = TodayDomainSummary(
            domain: .travel,
            total: trips.count,
            completed: 0,
            metric: trips.isEmpty ? nil : "\(trips.count) zapisanych podróży",
            status: status.forDomain(.travel)
        )
        summaries[.health] = TodayDomainSummary(
            domain: .health,
            total: reminders.count,
            completed: completedReminders.count,
            metric: energyMetric,
            status: status.forDomain(.health)
        )
        summaries[.affairs] = TodayDomainSummary(
            domain: .affairs,
            total: dueAffairs.count,
            completed: affairCompleted.filter { $0.dateKey == todayKey }.count,
            overdue: overdueAffairs.count,
            priorityTotal: dueAffairs.filter { $0.priority == "high" }.count,
            priorityCompleted: affairCompleted.filter { $0.dateKey == todayKey && $0.priority == "high" }.count,
            status: status.forDomain(.affairs)
        )

        var queue: [TodayQueueItem] = []
        queue += openTodayTasks.map {
            TodayQueueItem(
                id: "task-\($0.id)", domain: .tasks, entityID: String($0.id), title: $0.text,
                dateKey: todayKey, time: normalizedTime($0.time), kind: .task,
                isCompleted: false, priority: $0.priority, task: $0
            )
        }
        queue += overdueTasks.map {
            TodayQueueItem(
                id: "task-\($0.id)", domain: .tasks, entityID: String($0.id), title: $0.text,
                dateKey: validDateKey($0.calendarDate) ?? todayKey, time: normalizedTime($0.time), kind: .task,
                isCompleted: false, isOverdue: true, priority: $0.priority, task: $0
            )
        }
        queue += openTodayHabits.map {
            TodayQueueItem(
                id: "habit-\($0.id)", domain: .habits, entityID: String($0.id), title: $0.name,
                dateKey: todayKey, time: normalizedTime($0.time), kind: .habit,
                isCompleted: false, priority: $0.priority, habit: $0
            )
        }
        queue += todayWorkouts.filter { !$0.completed }.map {
            TodayQueueItem(
                id: "workout-\($0.id)", domain: .sport, entityID: $0.id, title: $0.title,
                dateKey: todayKey, kind: .workout, isCompleted: false
            )
        }
        queue += openWorkTasks.map {
            let dateKey = validDateKey($0.calendarDate) ?? todayKey
            return TodayQueueItem(
                id: "work-task-\($0.id)", domain: .work, entityID: String($0.id), title: $0.text,
                dateKey: dateKey, time: normalizedTime($0.time), kind: .workTask,
                isCompleted: false, isOverdue: dateKey < todayKey, priority: $0.priority, task: $0
            )
        }
        queue += reminders.filter { !$0.completedDates.contains(todayKey) }.map {
            TodayQueueItem(
                id: "health-reminder-\($0.id)", domain: .health, entityID: $0.id, title: $0.title,
                dateKey: todayKey, kind: .reminder, isCompleted: false
            )
        }
        queue += actionableAffairs.map {
            TodayQueueItem(
                id: "affair-\($0.kind)-\($0.id)", domain: .affairs, entityID: $0.id, title: $0.title,
                dateKey: $0.dateKey, time: $0.time, kind: .affair, isCompleted: false,
                isOverdue: $0.dateKey < todayKey,
                priority: $0.priority == "high" ? .high : nil
            )
        }

        // The same source may be present twice after a retry or a legacy
        // migration. IDs are namespaced by entity kind and are de-duplicated
        // before sorting, so a duplicate can never inflate the balance.
        queue = uniqueQueueItems(queue).sorted {
            queueSort($0, $1, todayKey: todayKey)
        }

        let currentMinutes = minutesSinceMidnight(input.referenceDate, calendar: calendar)
        let todayActionable = queue.filter { $0.dateKey == todayKey && !$0.isOverdue }
        let now = todayActionable
            .filter { item in
                guard let minutes = parseMinutes(item.time) else { return false }
                return minutes <= currentMinutes
            }
            .sorted { nowSort($0, $1) }
            .last
        let next = todayActionable
            .filter { item in
                guard let minutes = parseMinutes(item.time) else { return false }
                return minutes > currentMinutes
            }
            .sorted { nowSort($0, $1) }
            .prefix(3)

        return TodayAggregation(
            accountID: input.accountID,
            boundary: boundary,
            summaries: summaries,
            todayTasks: todayTasks,
            overdueTasks: overdueTasks,
            todayHabits: todayHabits,
            nutritionDay: nutritionDay,
            notes: uniqueNotes,
            queue: queue,
            now: now,
            next: Array(next)
        )
    }

    private struct StatusLookup {
        let statuses: [TodayDomain: TodayDomainStatus]

        init(_ statuses: [TodayDomain: TodayDomainStatus]) {
            self.statuses = statuses
        }

        func forDomain(_ domain: TodayDomain) -> TodayDomainStatus {
            if let status = statuses[domain] { return status }
            if domain == .habits, let taskStatus = statuses[.tasks] { return taskStatus }
            if domain == .tasks, let habitStatus = statuses[.habits] { return habitStatus }
            return .fresh
        }
    }

    private struct DatedAffair {
        let id: String
        let kind: String
        let title: String
        let dateKey: String
        let time: String?
        let completed: Bool
        let priority: String
    }

    private static func datedAffairs(_ workspace: AffairsWorkspace, todayKey: String) -> [DatedAffair] {
        var values: [DatedAffair] = []
        values += workspace.matters.compactMap { item in
            guard let dateKey = validDateKey(item.dueDate), dateKey <= todayKey else { return nil }
            return DatedAffair(id: item.id, kind: "matter", title: item.title, dateKey: dateKey, time: normalizedTime(item.time), completed: item.status == "done", priority: item.priority)
        }
        values += workspace.oneTimePayments.compactMap { item in
            guard let dateKey = validDateKey(item.dueDate), dateKey <= todayKey else { return nil }
            return DatedAffair(id: item.id, kind: "one-time", title: item.title, dateKey: dateKey, time: nil, completed: item.paid, priority: "normal")
        }
        values += workspace.payments.compactMap { item in
            guard item.active, let dateKey = validDateKey(item.nextDueDate), dateKey <= todayKey else { return nil }
            return DatedAffair(id: item.id, kind: "payment", title: item.name, dateKey: dateKey, time: nil, completed: false, priority: "normal")
        }
        values += workspace.subscriptions.compactMap { item in
            guard item.active, let dateKey = validDateKey(item.nextBillingDate), dateKey <= todayKey else { return nil }
            return DatedAffair(id: item.id, kind: "subscription", title: item.name, dateKey: dateKey, time: nil, completed: false, priority: "normal")
        }
        values += workspace.documents.compactMap { item in
            guard let dateKey = validDateKey(item.expiresAt), dateKey <= todayKey else { return nil }
            return DatedAffair(id: item.id, kind: "document", title: item.name, dateKey: dateKey, time: nil, completed: false, priority: "normal")
        }
        values += workspace.vehicleItems.compactMap { item in
            guard !item.done, let dateKey = validDateKey(item.dueDate), dateKey <= todayKey else { return nil }
            return DatedAffair(id: item.id, kind: "vehicle", title: item.title, dateKey: dateKey, time: nil, completed: false, priority: "normal")
        }

        let ordered = values.sorted {
            if $0.id != $1.id { return $0.id < $1.id }
            if $0.kind != $1.kind { return $0.kind < $1.kind }
            if $0.dateKey != $1.dateKey { return $0.dateKey < $1.dateKey }
            if $0.completed != $1.completed { return !$0.completed }
            if $0.title != $1.title { return $0.title < $1.title }
            if $0.time != $1.time { return ($0.time ?? "") < ($1.time ?? "") }
            return $0.priority < $1.priority
        }
        var seen = Set<String>()
        return ordered.filter { seen.insert("\($0.kind):\($0.id)").inserted }
    }

    private static func uniqueTasks(_ tasks: [WorkspaceTask]) -> [WorkspaceTask] {
        // Workspace merges can transiently contain the same task more than
        // once. Select the same winner as the old ID-sorted implementation,
        // but do it in O(n) and let the consumers' existing sort establish
        // display order afterwards.
        var unique: [Int: WorkspaceTask] = [:]
        unique.reserveCapacity(tasks.count)
        for task in tasks {
            guard let current = unique[task.id] else {
                unique[task.id] = task
                continue
            }
            let currentIsDeleted = current.deleted == true
            let taskIsDeleted = task.deleted == true
            if currentIsDeleted != taskIsDeleted {
                if !taskIsDeleted { unique[task.id] = task }
            } else if taskFingerprint(task) < taskFingerprint(current) {
                unique[task.id] = task
            }
        }
        return Array(unique.values)
    }

    private static func partition<Element>(
        _ values: [Element],
        where predicate: (Element) -> Bool
    ) -> (matching: [Element], other: [Element]) {
        var matching: [Element] = []
        var other: [Element] = []
        matching.reserveCapacity(values.count)
        other.reserveCapacity(values.count)
        for value in values {
            if predicate(value) {
                matching.append(value)
            } else {
                other.append(value)
            }
        }
        return (matching, other)
    }

    private static func uniqueHabits(_ habits: [WorkspaceHabit]) -> [WorkspaceHabit] {
        let ordered = habits.sorted {
            if $0.id != $1.id { return $0.id < $1.id }
            return habitFingerprint($0) < habitFingerprint($1)
        }
        var seen = Set<Int>()
        return ordered.filter { seen.insert($0.id).inserted }
    }

    private static func uniqueNotes(_ notes: [NoteRecord]) -> [NoteRecord] {
        let ordered = notes.sorted {
            if $0.id != $1.id { return $0.id < $1.id }
            if $0.archived != $1.archived { return !$0.archived }
            return noteFingerprint($0) < noteFingerprint($1)
        }
        var seen = Set<String>()
        return ordered.filter { seen.insert($0.id).inserted }
    }

    private static func uniqueWorkouts(_ workouts: [SportWorkout]) -> [SportWorkout] {
        let ordered = workouts.sorted {
            if $0.id != $1.id { return $0.id < $1.id }
            return [$0.date, $0.title, String($0.minutes), String($0.completed)].joined() < [$1.date, $1.title, String($1.minutes), String($1.completed)].joined()
        }
        var seen = Set<String>()
        return ordered.filter { seen.insert($0.id).inserted }
    }

    private static func uniqueGoals(_ goals: [GoalRecord]) -> [GoalRecord] {
        let ordered = goals.sorted { $0.id == $1.id ? $0.title < $1.title : $0.id < $1.id }
        var seen = Set<String>()
        return ordered.filter { seen.insert($0.id).inserted }
    }

    private static func uniqueFocusSessions(_ sessions: [WorkFocusSession]) -> [WorkFocusSession] {
        let ordered = sessions.sorted { $0.id == $1.id ? $0.endedAt < $1.endedAt : $0.id < $1.id }
        var seen = Set<String>()
        return ordered.filter { seen.insert($0.id).inserted }
    }

    private static func uniqueTrips(_ trips: [TravelRecord]) -> [TravelRecord] {
        let ordered = trips.sorted { $0.id == $1.id ? $0.destination < $1.destination : $0.id < $1.id }
        var seen = Set<String>()
        return ordered.filter { seen.insert($0.id).inserted }
    }

    private static func uniqueHealthReminders(_ reminders: [HealthReminder]) -> [HealthReminder] {
        let ordered = reminders.sorted { $0.id == $1.id ? $0.title < $1.title : $0.id < $1.id }
        var seen = Set<String>()
        return ordered.filter { seen.insert($0.id).inserted }
    }

    private static func uniqueNutritionEntries(_ day: NutritionDay) -> [NutritionEntry] {
        let entries = day.entries.breakfast + day.entries.lunch + day.entries.snack + day.entries.dinner
        let ordered = entries.sorted { $0.id == $1.id ? $0.name < $1.name : $0.id < $1.id }
        var seen = Set<String>()
        return ordered.filter { seen.insert($0.id).inserted }
    }

    private static func uniqueQueueItems(_ items: [TodayQueueItem]) -> [TodayQueueItem] {
        let ordered = items.sorted {
            if $0.id != $1.id { return $0.id < $1.id }
            if $0.dateKey != $1.dateKey { return $0.dateKey < $1.dateKey }
            return $0.title < $1.title
        }
        var seen = Set<String>()
        return ordered.filter { seen.insert($0.id).inserted }
    }

    private static func taskIsForToday(_ task: WorkspaceTask, todayKey: String) -> Bool {
        validDateKey(task.calendarDate) == todayKey || (task.calendarDate == nil && task.view == "dzis")
    }

    private static func taskSort(_ lhs: WorkspaceTask, _ rhs: WorkspaceTask) -> Bool {
        let leftTime = timeSortValue(lhs.time)
        let rightTime = timeSortValue(rhs.time)
        if leftTime != rightTime { return leftTime < rightTime }
        return lhs.id < rhs.id
    }

    private static func habitSort(_ lhs: WorkspaceHabit, _ rhs: WorkspaceHabit) -> Bool {
        let leftTime = timeSortValue(lhs.time)
        let rightTime = timeSortValue(rhs.time)
        if leftTime != rightTime { return leftTime < rightTime }
        return lhs.id < rhs.id
    }

    private static func workoutSort(_ lhs: SportWorkout, _ rhs: SportWorkout) -> Bool {
        if lhs.date != rhs.date { return lhs.date < rhs.date }
        if lhs.title != rhs.title { return lhs.title < rhs.title }
        return lhs.id < rhs.id
    }

    private static func queueSort(_ lhs: TodayQueueItem, _ rhs: TodayQueueItem, todayKey _: String) -> Bool {
        if lhs.isOverdue != rhs.isOverdue { return lhs.isOverdue }
        if lhs.dateKey != rhs.dateKey { return lhs.dateKey < rhs.dateKey }
        let leftTime = timeSortValue(lhs.time)
        let rightTime = timeSortValue(rhs.time)
        if leftTime != rightTime { return leftTime < rightTime }
        let leftPriority = prioritySortValue(lhs.priority)
        let rightPriority = prioritySortValue(rhs.priority)
        if leftPriority != rightPriority { return leftPriority > rightPriority }
        if lhs.title != rhs.title { return lhs.title < rhs.title }
        return lhs.id < rhs.id
    }

    private static func nowSort(_ lhs: TodayQueueItem, _ rhs: TodayQueueItem) -> Bool {
        let leftTime = timeSortValue(lhs.time)
        let rightTime = timeSortValue(rhs.time)
        if leftTime != rightTime { return leftTime < rightTime }
        return lhs.id < rhs.id
    }

    private static func timeSortValue(_ value: String?) -> Int {
        parseMinutes(value) ?? 1_440
    }

    private static func prioritySortValue(_ priority: TaskPriority?) -> Int {
        switch priority {
        case .high: return 3
        case .medium: return 2
        case .low: return 1
        case nil: return 0
        }
    }

    private static func parseMinutes(_ value: String?) -> Int? {
        guard let value else { return nil }
        let parts = value.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { return nil }
        return parts[0] * 60 + parts[1]
    }

    private static func normalizedTime(_ value: String?) -> String? {
        guard let value, parseMinutes(value) != nil else { return nil }
        return value
    }

    private static func minutesSinceMidnight(_ date: Date, calendar: Calendar) -> Int {
        let components = calendar.dateComponents([.hour, .minute], from: date)
        return (components.hour ?? 0) * 60 + (components.minute ?? 0)
    }

    private static func timestamp(_ value: String, isInside boundary: TodayDayBoundary, calendar _: Calendar) -> Bool {
        guard let date = RootineDate.date(from: value) else { return false }
        return boundary.contains(date)
    }

    private static func localDateKey(_ value: String, calendar: Calendar) -> String? {
        if let date = RootineDate.date(from: value) {
            return RootineDate.localDate(date, calendar: calendar)
        }
        return validDateKey(value)
    }

    private static func validDateKey(_ value: String?) -> String? {
        guard let value else { return nil }
        let key = String(value.prefix(10))
        let parts = key.split(separator: "-")
        guard parts.count == 3,
              key.count == 10,
              parts[0].count == 4,
              parts[1].count == 2,
              parts[2].count == 2,
              parts.allSatisfy({ $0.allSatisfy(\.isNumber) }),
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]) else { return nil }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let components = DateComponents(year: year, month: month, day: day)
        guard let date = calendar.date(from: components),
              RootineDate.localDate(date, calendar: calendar) == key else { return nil }
        return key
    }

    private static func formatNumber(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "pl_PL")
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value)) ?? "0"
    }

    private static func taskFingerprint(_ task: WorkspaceTask) -> String {
        [
            task.text,
            task.calendarDate ?? "",
            task.time ?? "",
            String(task.done),
            task.view,
            task.priority?.rawValue ?? "",
            task.source?.kind ?? "",
            String(task.deleted == true)
        ].joined(separator: "|")
    }

    private static func habitFingerprint(_ habit: WorkspaceHabit) -> String {
        [habit.name, habit.time ?? "", String(habit.done), habit.schedule?.startDate ?? ""].joined(separator: "|")
    }

    private static func noteFingerprint(_ note: NoteRecord) -> String {
        [note.updatedAt, note.title, note.body].joined(separator: "|")
    }
}

/// A single, testable plan for the Today bulk overdue action. The plan keeps
/// the original task alongside its date-only projection so Undo can restore
/// exactly the same record without rebuilding it through an editor path.
struct TodayBulkRescheduleChange: Equatable, Sendable {
    let original: WorkspaceTask
    let updated: WorkspaceTask
}

struct TodayBulkReschedulePlan: Equatable, Sendable {
    let changes: [TodayBulkRescheduleChange]
    let skippedRecurring: [WorkspaceTask]

    var isEmpty: Bool { changes.isEmpty && skippedRecurring.isEmpty }
}

struct TodayBulkRescheduleUndoPlan: Equatable, Sendable {
    let tasks: [WorkspaceTask]
    let restoredIDs: [Int]
    let skippedIDs: [Int]
}

/// Implements the same overdue predicate as TodayAggregationService while
/// making the recurrence boundary explicit. A recurring task's calendarDate is
/// its series anchor, so bulk rescheduling never changes that field. Until the
/// data model supports occurrence-level moves, those records are reported to
/// the caller for a concrete user-facing explanation.
enum TodayBulkReschedulePlanner {
    static func plan(tasks: [WorkspaceTask], todayKey: String) -> TodayBulkReschedulePlan {
        guard RootineDate.isLocalDateKey(todayKey) else {
            return TodayBulkReschedulePlan(changes: [], skippedRecurring: [])
        }

        let orderedTasks = tasks.sorted {
            if $0.id != $1.id { return $0.id < $1.id }
            if ($0.deleted == true) != ($1.deleted == true) { return $0.deleted != true }
            let leftFingerprint = [
                $0.text,
                $0.calendarDate ?? "",
                $0.time ?? "",
                String($0.done),
                $0.view,
                $0.priority?.rawValue ?? "",
                $0.source?.kind ?? "",
                String($0.deleted == true)
            ].joined(separator: "|")
            let rightFingerprint = [
                $1.text,
                $1.calendarDate ?? "",
                $1.time ?? "",
                String($1.done),
                $1.view,
                $1.priority?.rawValue ?? "",
                $1.source?.kind ?? "",
                String($1.deleted == true)
            ].joined(separator: "|")
            return leftFingerprint < rightFingerprint
        }
        var seenIDs = Set<Int>()
        var changes: [TodayBulkRescheduleChange] = []
        var skippedRecurring: [WorkspaceTask] = []

        for task in orderedTasks where seenIDs.insert(task.id).inserted {
            guard task.deleted != true,
                  task.source?.kind != "work",
                  let calendarDate = task.calendarDate,
                  RootineDate.isLocalDateKey(calendarDate),
                  calendarDate < todayKey,
                  !rootineTaskIsDoneOnDate(task, dateKey: todayKey) else {
                continue
            }

            if task.schedule?.recurrence != nil {
                skippedRecurring.append(task)
                continue
            }

            var updated = task
            updated.calendarDate = todayKey
            updated.view = rootineTaskViewForCalendarDate(todayKey, referenceDate: todayKey)
            changes.append(TodayBulkRescheduleChange(original: task, updated: updated))
        }

        return TodayBulkReschedulePlan(changes: changes, skippedRecurring: skippedRecurring)
    }

    /// Restores only rows that still equal the post-operation projection. If a
    /// task was edited after the bulk action, it is left untouched and its ID
    /// is returned as skipped instead of overwriting the newer user change.
    static func undo(
        changes: [TodayBulkRescheduleChange],
        in tasks: [WorkspaceTask]
    ) -> TodayBulkRescheduleUndoPlan {
        var restoredIDs: [Int] = []
        var skippedIDs: [Int] = []
        var restored = tasks

        for change in changes {
            guard let index = restored.firstIndex(where: { $0.id == change.updated.id }) else {
                skippedIDs.append(change.updated.id)
                continue
            }
            guard restored[index] == change.updated else {
                skippedIDs.append(change.updated.id)
                continue
            }
            restored[index] = change.original
            restoredIDs.append(change.updated.id)
        }

        return TodayBulkRescheduleUndoPlan(
            tasks: restored,
            restoredIDs: restoredIDs,
            skippedIDs: skippedIDs
        )
    }
}

/// A bounded in-memory cache avoids recomputing recurrence and large-account
/// projections during rapid tab switches. The account is the outer key so a
/// sign-out/account switch can never return another user's Today projection.
actor TodayAggregationCache {
    private let maxEntriesPerAccount: Int
    private var values: [String: [String: TodayAggregation]] = [:]
    private var order: [String: [String]] = [:]

    init(maxEntriesPerAccount: Int = 7) {
        self.maxEntriesPerAccount = max(1, maxEntriesPerAccount)
    }

    func value(accountID: String, dateKey: String) -> TodayAggregation? {
        let accountID = normalizedAccountID(accountID)
        guard !accountID.isEmpty, let value = values[accountID]?[dateKey] else { return nil }
        // Treat reads as use so a frequently visited day survives bounded
        // eviction while still keeping each account's cache isolated.
        if var accountOrder = order[accountID], let index = accountOrder.firstIndex(of: dateKey) {
            accountOrder.remove(at: index)
            accountOrder.append(dateKey)
            order[accountID] = accountOrder
        }
        return value
    }

    func insert(_ aggregation: TodayAggregation) {
        let accountID = normalizedAccountID(aggregation.accountID)
        guard !accountID.isEmpty else { return }
        var accountValues = values[accountID] ?? [:]
        var accountOrder = order[accountID] ?? []
        accountValues[aggregation.boundary.dateKey] = aggregation
        accountOrder.removeAll { $0 == aggregation.boundary.dateKey }
        accountOrder.append(aggregation.boundary.dateKey)
        while accountOrder.count > maxEntriesPerAccount {
            let evicted = accountOrder.removeFirst()
            accountValues[evicted] = nil
        }
        values[accountID] = accountValues
        order[accountID] = accountOrder
    }

    func remove(accountID: String) {
        let accountID = normalizedAccountID(accountID)
        values[accountID] = nil
        order[accountID] = nil
    }

    func removeAll() {
        values.removeAll()
        order.removeAll()
    }

    private func normalizedAccountID(_ accountID: String) -> String {
        accountID.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

enum TodayQuickAction: Equatable, Sendable {
    case task(title: String, time: String?, priority: TaskPriority?)
    case habit(name: String, time: String?, priority: TaskPriority?, schedule: WorkspaceHabitSchedule?)
}

/// Today quick actions deliberately delegate to AppEnvironment's existing
/// validated methods. This keeps operation IDs, local persistence, sync
/// queueing, validation and duplicate prevention identical to detail screens.
extension AppEnvironment {
    func applyTodayQuickAction(_ action: TodayQuickAction, operationID: String = UUID().uuidString) async {
        switch action {
        case let .task(title, time, priority):
            await addTodayTask(text: title, time: time, priority: priority, operationID: operationID)
        case let .habit(name, time, priority, schedule):
            await addHabit(name: name, time: time, priority: priority, schedule: schedule, operationID: operationID)
        }
    }
}
