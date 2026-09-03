import Foundation

enum RootineStorageKey: String, CaseIterable, Codable, Sendable {
    case tasks = "rootine.task-workspace.v1"
    case nutrition = "rootine.nutrition-workspace.v1"
    case notes = "rootine.notes-workspace.v1"
    case sport = "rootine.sport-workspace.v1"
    case goals = "rootine.goals-workspace.v1"
    case work = "rootine.work-workspace.v1"
    case travel = "rootine.travel-workspace.v1"
    case health = "rootine.health-workspace.v1"
    case affairs = "rootine.affairs.workspace.v1"
    // Private local copies of the last full canonical payload. They are never
    // uploaded; they let compact native projections update one record without
    // deleting web-only fields.
    case sportCanonicalShadow = "rootine.canonical-shadow.sport.v1"
    case goalsCanonicalShadow = "rootine.canonical-shadow.goals.v1"
    case workCanonicalShadow = "rootine.canonical-shadow.work.v1"
    case travelCanonicalShadow = "rootine.canonical-shadow.travel.v1"
    case healthCanonicalShadow = "rootine.canonical-shadow.health.v1"
    case notesCanonicalShadow = "rootine.canonical-shadow.notes.v1"
    /// Local-only product results. This is deliberately separate from the
    /// shared nutrition workspace so a catalog cache can never be uploaded as
    /// user-owned nutrition data or invalidate the v6 canonical schema.
    case nutritionProductCache = "rootine.nutrition-product-cache.v1"
    // The normalized reader keeps the last materialized relational document
    // separately from the compact aggregate cache. This is what lets an
    // incremental pull preserve fields that are intentionally not surfaced
    // by a native screen (for example booking, budget, or custom web fields).
    case normalizedReadState = "rootine.normalized-read-state.v1"

    /// Local snapshots use the same version numbers as their canonical web
    /// contracts. A future version must be migrated explicitly instead of
    /// being decoded optimistically and then overwritten by an older client.
    var supportedLocalVersion: Int? {
        switch self {
        case .tasks: return 2
        case .nutrition: return 6
        case .notes, .sport, .goals, .work, .travel, .health: return 1
        case .affairs: return 2
        case .sportCanonicalShadow, .goalsCanonicalShadow, .workCanonicalShadow,
             .travelCanonicalShadow, .healthCanonicalShadow, .notesCanonicalShadow:
            return nil
        case .normalizedReadState:
            return nil
        case .nutritionProductCache:
            return nil
        }
    }
}

enum RootineLocalIdentifier {
    /// FNV-1a keeps IDs deterministic across launches without depending on
    /// Swift's randomized `Hashable` implementation. Values stay inside the
    /// integer range that JavaScript can represent exactly.
    static func integer(namespace: String, operationID: String) -> Int {
        let hash = fnv1a64("\(namespace):\(operationID)")
        return max(1, Int(hash & 0x001F_FFFF_FFFF_FFFF))
    }

    static func string(namespace: String, operationID: String) -> String {
        let hash = fnv1a64("\(namespace):\(operationID)")
        return "ios-\(namespace)-\(String(format: "%016llx", hash))"
    }

    private static func fnv1a64(_ value: String) -> UInt64 {
        value.utf8.reduce(14_695_981_039_346_656_037) { hash, byte in
            (hash ^ UInt64(byte)) &* 1_099_511_628_211
        }
    }
}

struct WorkspaceCreationGate {
    private var activeFingerprints: Set<String> = []

    mutating func claim(_ fingerprint: String) -> Bool {
        activeFingerprints.insert(fingerprint).inserted
    }

    mutating func release(_ fingerprint: String) {
        activeFingerprints.remove(fingerprint)
    }
}

enum TaskPriority: String, Codable, CaseIterable, Equatable, Sendable {
    case high
    case medium
    case low
}

struct WorkspaceTaxonomy: Codable, Equatable, Sendable {
    var id: String
    var label: String
    var color: String
}

struct WorkspaceTaskSchedule: Codable, Equatable, Sendable {
    var allDay: Bool
    var startTime: String
    var endTime: String? = nil
    var endDate: String? = nil
    var reminderMinutes: Int? = nil
    var recurrence: String? = nil
    var completedDates: [String]? = nil
    var completedAtByDate: [String: String]? = nil
    var timezone: String

    var validatedRecurrence: TaskRecurrence? {
        recurrence.flatMap(TaskRecurrence.init(rawValue:))
    }
}

enum TaskRecurrence: String, Codable, CaseIterable, Sendable {
    case daily
    case weekly
    case monthly
    case yearly
}

enum HabitScheduleType: String, Codable, CaseIterable, Sendable {
    case daily
    case weekly
    case interval
}

struct WorkspaceTaskSubtask: Codable, Equatable, Identifiable, Sendable {
    var id: Int
    var text: String
    var done: Bool
}

struct WorkspaceTaskComment: Codable, Equatable, Identifiable, Sendable {
    var id: Int
    var author: String
    var text: String
    var time: String
}

struct CommitmentTaskSource: Codable, Equatable, Sendable {
    var kind: String
    var entity: String
    var context: String
    var href: String
    var originTaskId: Int? = nil
    var managed: String? = nil
}

struct WorkspaceTask: Codable, Equatable, Identifiable, Sendable {
    var id: Int
    var text: String
    var done: Bool
    var completedAt: String? = nil
    var time: String? = nil
    var endTime: String? = nil
    var tags: [String]? = nil
    var list: String? = nil
    var view: String
    var priority: TaskPriority? = nil
    var notes: String? = nil
    var deleted: Bool? = nil
    var calendarDate: String? = nil
    var date: String? = nil
    var subtasks: [WorkspaceTaskSubtask]? = nil
    var comments: [WorkspaceTaskComment]? = nil
    var schedule: WorkspaceTaskSchedule? = nil
    var source: CommitmentTaskSource? = nil
}

func rootineTaskViewForCalendarDate(_ dateKey: String?, referenceDate: String = RootineDate.localDate()) -> String {
    guard let dateKey, RootineDate.isLocalDateKey(dateKey),
          let days = RootineDate.calendarDaysBetween(referenceDate, dateKey) else { return "bezterminu" }
    if days <= 0 { return "dzis" }
    if days == 1 { return "jutro" }
    if days <= 7 { return "7dni" }
    if days <= 30 { return "30dni" }
    return "wszystkie"
}

func rootineTaskSchedule(
    for dateKey: String?,
    time: String?,
    endTime: String? = nil,
    existing: WorkspaceTaskSchedule? = nil,
    timezone: TimeZone = .current
) -> WorkspaceTaskSchedule? {
    guard dateKey != nil else { return nil }
    let normalizedTime = time?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let validTime = normalizedTime.isEmpty ? nil : (RootineDate.isClockTime(normalizedTime) ? normalizedTime : nil)
    let zone = existing.flatMap { TimeZone(identifier: $0.timezone) } ?? timezone
    return WorkspaceTaskSchedule(
        allDay: validTime == nil,
        startTime: validTime ?? "",
        endTime: validTime == nil ? nil : endTime,
        endDate: existing?.endDate,
        reminderMinutes: existing?.reminderMinutes,
        recurrence: existing?.recurrence,
        completedDates: existing?.completedDates,
        completedAtByDate: existing?.completedAtByDate,
        timezone: zone.identifier
    )
}

func rootineTaskOccurrenceDates(_ task: WorkspaceTask, from rangeStart: String, through rangeEnd: String) -> [String] {
    rootineTaskOccurrences([task], from: rangeStart, through: rangeEnd).map(\.calendarDate)
}

/// Returns the completion state for the requested local day. Recurring tasks
/// carry an explicit per-day completion map; one-off tasks keep their legacy
/// global `done` flag so older server payloads remain fully compatible.
func rootineTaskIsDoneOnDate(_ task: WorkspaceTask, dateKey: String = RootineDate.localDate()) -> Bool {
    guard let schedule = task.schedule else { return task.done }
    let anchorDate = task.calendarDate ?? task.date
    // The source occurrence keeps the legacy global flag. Per-date maps are
    // for virtual recurring occurrences, so an anchor completed on its own
    // date remains complete even when a map contains only another date.
    if schedule.recurrence != nil, anchorDate == dateKey, task.done { return true }
    // Some web payloads contain both maps, while older records contain only
    // one. Treat either source as authoritative and avoid an empty
    // `completedDates` array masking a populated timestamp map.
    if schedule.completedDates?.contains(dateKey) == true { return true }
    if schedule.completedAtByDate?[dateKey] != nil { return true }
    if schedule.completedDates != nil || schedule.completedAtByDate != nil { return false }
    // A legacy recurring record can have only the global `done` flag. That
    // flag belongs to the source occurrence, not to every future occurrence.
    // Once a per-date map exists it is authoritative above.
    if schedule.recurrence != nil {
        return task.done && (anchorDate == nil || anchorDate == dateKey)
    }
    return task.done
}

/// Applies completion to one occurrence without mutating the source task's
/// other dates. This is the model-level counterpart of the Today and Calendar
/// actions, and accepts an explicit timestamp so sync/replay tests do not need
/// to depend on wall-clock time.
func rootineTaskSettingCompletion(
    _ task: WorkspaceTask,
    dateKey: String,
    done: Bool,
    completedAt: String? = nil
) -> WorkspaceTask {
    guard RootineDate.isValidLocalDate(dateKey) else { return task }
    guard var schedule = task.schedule,
          schedule.recurrence != nil
            || schedule.completedDates != nil
            || schedule.completedAtByDate != nil else {
        var result = task
        result.done = done
        result.completedAt = done ? completedAt : nil
        return result
    }

    let anchorDate = task.calendarDate ?? task.date
    // The persisted source row owns its anchor occurrence. Keep that state in
    // the legacy fields and reserve completion maps for virtual dates, which
    // matches the web task-schedule contract and avoids redundant anchor keys.
    if schedule.recurrence != nil, anchorDate == dateKey {
        var result = task
        result.done = done
        result.completedAt = done ? completedAt : nil
        return result
    }

    var completedDates = Set((schedule.completedDates ?? []).filter(RootineDate.isValidLocalDate))
    var completedAtByDate = schedule.completedAtByDate ?? [:]
    if done {
        completedDates.insert(dateKey)
        if let completedAt { completedAtByDate[dateKey] = completedAt }
    } else {
        completedDates.remove(dateKey)
        completedAtByDate.removeValue(forKey: dateKey)
    }
    schedule.completedDates = completedDates.sorted()
    schedule.completedAtByDate = completedAtByDate.isEmpty ? nil : completedAtByDate

    var result = task
    result.schedule = schedule
    if schedule.recurrence == nil, anchorDate == dateKey {
        result.done = done
        result.completedAt = done ? completedAt : nil
    }
    return result
}

/// A stable task occurrence projected from a canonical workspace task. The
/// source task ID remains available for completion/edit actions while `key`
/// identifies a particular date, including virtual recurring occurrences.
struct RootineCalendarOccurrence: Equatable, Identifiable, Sendable {
    let key: String
    let task: WorkspaceTask
    let calendarDate: String
    let isVirtual: Bool

    var id: String { key }
    var sourceTaskID: Int { task.id }
    var title: String { task.text }
    var time: String? {
        guard task.schedule?.allDay != true else { return nil }
        return task.schedule?.startTime.isEmpty == false ? task.schedule?.startTime : task.time
    }
    var endTime: String? {
        guard task.schedule?.allDay != true else { return nil }
        return task.schedule?.endTime ?? task.endTime
    }
    var isDone: Bool { rootineTaskIsDoneOnDate(task, dateKey: calendarDate) }
}

/// Deterministically expands dated task records into calendar occurrences.
/// Date-only arithmetic is deliberately independent of elapsed seconds, so a
/// DST transition cannot skip or duplicate a daily/weekly occurrence.
func rootineTaskOccurrences(
    _ tasks: [WorkspaceTask],
    from rangeStart: String,
    through rangeEnd: String
) -> [RootineCalendarOccurrence] {
    guard RootineDate.isValidLocalDate(rangeStart),
          RootineDate.isValidLocalDate(rangeEnd),
          rangeStart <= rangeEnd else { return [] }

    var result: [RootineCalendarOccurrence] = []
    for task in tasks where task.deleted != true {
        guard let anchorDate = task.calendarDate ?? task.date,
              RootineDate.isValidLocalDate(anchorDate) else { continue }
        let recurrence = rootineTaskRecurrence(task.schedule?.recurrence)
        let recurrenceEnd = task.schedule?.endDate.flatMap { RootineDate.isValidLocalDate($0) ? $0 : nil }
        let effectiveEnd = min(rangeEnd, recurrenceEnd ?? rangeEnd)
        guard rangeStart <= effectiveEnd else { continue }
        let dates = rootineRecurrenceDates(
            anchorDate: anchorDate,
            recurrence: recurrence,
            rangeStart: rangeStart,
            rangeEnd: effectiveEnd
        )
        for date in dates {
            result.append(RootineCalendarOccurrence(
                key: "task:\(task.id)@\(date)",
                task: task,
                calendarDate: date,
                isVirtual: date != anchorDate
            ))
        }
    }
    return result.sorted {
        $0.calendarDate < $1.calendarDate
            || ($0.calendarDate == $1.calendarDate && ($0.time ?? "") < ($1.time ?? ""))
            || ($0.calendarDate == $1.calendarDate && ($0.time ?? "") == ($1.time ?? "") && $0.key < $1.key)
    }
}

/// Alias named after the owning surface; keeping both names makes the seam
/// readable from Calendar and from Today without duplicating implementation.
func rootineCalendarOccurrences(
    _ tasks: [WorkspaceTask],
    from rangeStart: String,
    through rangeEnd: String
) -> [RootineCalendarOccurrence] {
    rootineTaskOccurrences(tasks, from: rangeStart, through: rangeEnd)
}

private enum RootineTaskRecurrence: Equatable {
    case oneOff
    case daily
    case weekly(interval: Int)
    case monthly
    case yearly
}

private func rootineTaskRecurrence(_ rawValue: String?) -> RootineTaskRecurrence {
    let raw = rawValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        .replacingOccurrences(of: "_", with: "-")
        .replacingOccurrences(of: " ", with: "-")
    guard let raw, !raw.isEmpty else { return .oneOff }
    if raw == "daily" || raw == "every-day" || raw == "everyday" || raw.contains("freq=daily") { return .daily }
    if raw == "biweekly" || raw == "every-2-weeks" || raw == "every-two-weeks" {
        return .weekly(interval: 2)
    }
    if raw == "weekly" || raw == "every-week" || raw.contains("freq=weekly") {
        let interval = raw.split(separator: ";").compactMap { component -> Int? in
            let pair = component.split(separator: "=", maxSplits: 1).map(String.init)
            guard pair.count == 2, pair[0] == "interval", let value = Int(pair[1]), value > 0 else { return nil }
            return value
        }.first ?? 1
        return .weekly(interval: interval)
    }
    if raw == "monthly" || raw == "every-month" || raw.contains("freq=monthly") { return .monthly }
    if raw == "yearly" || raw == "annually" || raw == "every-year" || raw.contains("freq=yearly") { return .yearly }
    return .oneOff
}

private func rootineRecurrenceDates(
    anchorDate: String,
    recurrence: RootineTaskRecurrence,
    rangeStart: String,
    rangeEnd: String
) -> [String] {
    guard anchorDate <= rangeEnd else { return [] }
    let firstDate = max(anchorDate, rangeStart)
    switch recurrence {
    case .oneOff:
        return anchorDate >= rangeStart && anchorDate <= rangeEnd ? [anchorDate] : []
    case .daily:
        let step = 1
        let distance = RootineDate.daysBetween(anchorDate, firstDate) ?? 0
        let firstOffset = max(0, Int(ceil(Double(distance) / Double(step))) * step)
        var result: [String] = []
        var date = RootineDate.shiftLocalDate(anchorDate, by: firstOffset)
        while date <= rangeEnd {
            if date >= rangeStart { result.append(date) }
            date = RootineDate.shiftLocalDate(date, by: step)
        }
        return result
    case .weekly(let interval):
        let step = max(1, interval) * 7
        let distance = RootineDate.daysBetween(anchorDate, firstDate) ?? 0
        let firstOffset = max(0, Int(ceil(Double(distance) / Double(step))) * step)
        var result: [String] = []
        var date = RootineDate.shiftLocalDate(anchorDate, by: firstOffset)
        while date <= rangeEnd {
            if date >= rangeStart { result.append(date) }
            date = RootineDate.shiftLocalDate(date, by: step)
        }
        return result
    case .monthly:
        guard let anchor = rootineDateParts(anchorDate),
              let start = rootineDateParts(firstDate),
              let end = rootineDateParts(rangeEnd) else { return [] }
        let anchorMonth = anchor.year * 12 + anchor.month - 1
        let startMonth = start.year * 12 + start.month - 1
        let endMonth = end.year * 12 + end.month - 1
        return (max(anchorMonth, startMonth)...endMonth).compactMap { monthIndex in
            let year = monthIndex / 12
            let month = monthIndex % 12 + 1
            let day = min(anchor.day, rootineDaysInMonth(year: year, month: month))
            let candidate = rootineDateKey(year: year, month: month, day: day)
            return candidate >= anchorDate && candidate >= rangeStart && candidate <= rangeEnd ? candidate : nil
        }
    case .yearly:
        guard let anchor = rootineDateParts(anchorDate),
              let start = rootineDateParts(firstDate),
              let end = rootineDateParts(rangeEnd) else { return [] }
        return (max(anchor.year, start.year)...end.year).compactMap { year in
            let day = min(anchor.day, rootineDaysInMonth(year: year, month: anchor.month))
            let candidate = rootineDateKey(year: year, month: anchor.month, day: day)
            return candidate >= anchorDate && candidate >= rangeStart && candidate <= rangeEnd ? candidate : nil
        }
    }
}

private func rootineDateParts(_ value: String) -> (year: Int, month: Int, day: Int)? {
    let parts = value.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return (parts[0], parts[1], parts[2])
}

private func rootineDateKey(year: Int, month: Int, day: Int) -> String {
    String(format: "%04d-%02d-%02d", year, month, day)
}

private func rootineDaysInMonth(year: Int, month: Int) -> Int {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
    let nextMonth = month == 12 ? 1 : month + 1
    let nextYear = month == 12 ? year + 1 : year
    let firstOfNext = calendar.date(from: DateComponents(year: nextYear, month: nextMonth, day: 1, hour: 12)) ?? Date.distantPast
    return calendar.date(byAdding: .day, value: -1, to: firstOfNext).map { calendar.component(.day, from: $0) } ?? 28
}

struct WorkspaceHabitSchedule: Codable, Equatable, Sendable {
    var type: String
    var weekdays: [Int]? = nil
    var interval: Int? = nil
    var startDate: String
    var endDate: String? = nil

    var validatedType: HabitScheduleType? {
        HabitScheduleType(rawValue: type)
    }
}

struct WorkspaceHabitPause: Codable, Equatable, Sendable {
    var startDate: String
    var endDate: String? = nil
}

struct WorkspaceHabit: Codable, Equatable, Identifiable, Sendable {
    var id: Int
    var name: String
    var streak: Int
    var done: Bool
    var completedDates: [String]? = nil
    var schedule: WorkspaceHabitSchedule? = nil
    var priority: TaskPriority? = nil
    var time: String? = nil
    var timeOfDay: String? = nil
    var reminderMinutes: Int? = nil
    var color: String? = nil
    var pausePeriods: [WorkspaceHabitPause]? = nil
}

// Habit scheduling is shared by the native screens and the persistence layer.
// Keeping it here prevents the Today and Tasks views from drifting apart when
// a habit uses weekly or interval scheduling.
func rootineHabitIsPausedOnDate(_ habit: WorkspaceHabit, dateKey: String) -> Bool {
    (habit.pausePeriods ?? []).contains { period in
        dateKey >= period.startDate && (period.endDate == nil || dateKey <= period.endDate!)
    }
}

func rootineHabitIsScheduledOnDate(
    _ habit: WorkspaceHabit,
    dateKey: String,
    calendar: Calendar = .current
) -> Bool {
    guard let schedule = habit.schedule else { return true }
    guard dateKey >= schedule.startDate,
          schedule.endDate == nil || dateKey <= schedule.endDate!,
          !rootineHabitIsPausedOnDate(habit, dateKey: dateKey) else { return false }

    switch schedule.type {
    case "daily":
        return true
    case "weekly":
        guard let date = rootineHabitDate(from: dateKey, calendar: calendar),
              let start = rootineHabitDate(from: schedule.startDate, calendar: calendar) else { return true }
        let weekday = calendar.component(.weekday, from: date)
        let mondayWeekday = weekday == 1 ? 7 : weekday - 1
        guard schedule.weekdays?.contains(mondayWeekday) ?? true else { return false }
        let startWeek = rootineHabitMondayStart(start, calendar: calendar)
        let currentWeek = rootineHabitMondayStart(date, calendar: calendar)
        let startWeekKey = RootineDate.localDate(startWeek, calendar: calendar)
        let currentWeekKey = RootineDate.localDate(currentWeek, calendar: calendar)
        let days = RootineDate.calendarDaysBetween(startWeekKey, currentWeekKey) ?? 0
        return days >= 0 && (days / 7) % max(1, schedule.interval ?? 1) == 0
    case "interval":
        guard rootineHabitDate(from: dateKey, calendar: calendar) != nil,
              rootineHabitDate(from: schedule.startDate, calendar: calendar) != nil else { return true }
        let days = RootineDate.calendarDaysBetween(schedule.startDate, dateKey) ?? -1
        return days >= 0 && days % max(1, schedule.interval ?? 1) == 0
    default:
        return true
    }
}

func rootineHabitIsDoneOnDate(_ habit: WorkspaceHabit, dateKey: String) -> Bool {
    habit.completedDates?.contains(dateKey) ?? (habit.done && dateKey == RootineDate.localDate())
}

func rootineHabitCurrentStreak(
    _ habit: WorkspaceHabit,
    referenceDate: String = RootineDate.localDate(),
    calendar: Calendar = .current
) -> Int {
    var streak = 0
    for offset in 0..<3660 {
        guard let dateKey = RootineDate.shiftLocalDateKey(referenceDate, by: -offset) else { break }
        if let startDate = habit.schedule?.startDate, dateKey < startDate { break }
        if rootineHabitIsPausedOnDate(habit, dateKey: dateKey) { continue }
        if !rootineHabitIsScheduledOnDate(habit, dateKey: dateKey, calendar: calendar) { continue }
        if !rootineHabitIsDoneOnDate(habit, dateKey: dateKey) { break }
        streak += 1
    }
    return streak
}

enum RootineHabitDayState: String, Sendable {
    case completed
    case scheduled
    case paused
    case rest
    case inactive
}

func rootineHabitDayState(
    _ habit: WorkspaceHabit,
    dateKey: String = RootineDate.localDate(),
    calendar: Calendar = .current
) -> RootineHabitDayState {
    if rootineHabitIsPausedOnDate(habit, dateKey: dateKey) { return .paused }
    // A historical correction is intentional even when it was entered outside
    // the active/scheduled range. Keep it visible in history rather than
    // silently dropping a valid completion from the aggregate.
    if rootineHabitIsDoneOnDate(habit, dateKey: dateKey), dateKey <= RootineDate.localDate() {
        return .completed
    }
    guard let schedule = habit.schedule else { return .scheduled }
    if dateKey < schedule.startDate || (schedule.endDate != nil && dateKey > schedule.endDate!) {
        return .inactive
    }
    return rootineHabitIsScheduledOnDate(habit, dateKey: dateKey, calendar: calendar) ? .scheduled : .rest
}

/// Returns a canonical habit value after importing a legacy streak-only
/// record. The function is pure so startup, archive import, and tests can use
/// exactly the same normalization rules.
func rootineNormalizedHabit(_ habit: WorkspaceHabit, referenceDate: String = RootineDate.localDate()) -> WorkspaceHabit {
    let legacyEndDate = habit.done ? referenceDate : (RootineDate.shiftLocalDateKey(referenceDate, by: -1) ?? referenceDate)
    var sourceDates = habit.completedDates ?? []
    if habit.schedule == nil, habit.streak > 0 {
        sourceDates.append(contentsOf: (0..<habit.streak).compactMap { RootineDate.shiftLocalDateKey(legacyEndDate, by: -$0) })
    }
    let completedDates = Array(Set(sourceDates.filter(RootineDate.isLocalDateKey))).sorted()
    let schedule: WorkspaceHabitSchedule
    if let existing = habit.schedule, existing.validatedType != nil, RootineDate.isLocalDateKey(existing.startDate) {
        schedule = WorkspaceHabitSchedule(
            type: existing.type,
            weekdays: existing.weekdays.map { Array(Set($0.filter { (1...7).contains($0) })).sorted() },
            interval: existing.interval,
            startDate: existing.startDate,
            endDate: existing.endDate
        )
    } else {
        schedule = WorkspaceHabitSchedule(type: "daily", startDate: completedDates.first ?? referenceDate)
    }
    let pauses = (habit.pausePeriods ?? []).filter {
        RootineDate.isLocalDateKey($0.startDate)
            && ($0.endDate == nil || (RootineDate.isLocalDateKey($0.endDate!) && $0.endDate! >= $0.startDate))
    }
    var normalized = habit
    normalized.completedDates = completedDates
    normalized.schedule = schedule
    normalized.pausePeriods = pauses
    normalized.done = rootineHabitIsScheduledOnDate(normalized, dateKey: referenceDate)
        && rootineHabitIsDoneOnDate(normalized, dateKey: referenceDate)
    normalized.streak = rootineHabitCurrentStreak(normalized, referenceDate: referenceDate)
    return normalized
}

func rootineSetHabitCompletionOnDate(
    _ habit: WorkspaceHabit,
    dateKey: String,
    done: Bool,
    referenceDate: String = RootineDate.localDate()
) -> WorkspaceHabit {
    guard RootineDate.isLocalDateKey(dateKey),
          (!done || (dateKey <= referenceDate && !rootineHabitIsPausedOnDate(habit, dateKey: dateKey))) else { return habit }
    var dates = Set(habit.completedDates ?? [])
    if done { dates.insert(dateKey) } else { dates.remove(dateKey) }
    return rootineNormalizedHabit(
        WorkspaceHabit(
            id: habit.id,
            name: habit.name,
            streak: habit.streak,
            done: habit.done,
            completedDates: dates.sorted(),
            schedule: habit.schedule,
            priority: habit.priority,
            time: habit.time,
            timeOfDay: habit.timeOfDay,
            reminderMinutes: habit.reminderMinutes,
            color: habit.color,
            pausePeriods: habit.pausePeriods
        ),
        referenceDate: referenceDate
    )
}

private func rootineHabitDate(from key: String, calendar: Calendar) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
}

private func rootineHabitMondayStart(_ date: Date, calendar: Calendar) -> Date {
    let startOfDay = calendar.startOfDay(for: date)
    let weekday = calendar.component(.weekday, from: startOfDay)
    let daysFromMonday = weekday == 1 ? 6 : weekday - 2
    return calendar.date(byAdding: .day, value: -daysFromMonday, to: startOfDay) ?? startOfDay
}

struct TaskWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var tasks: [WorkspaceTask]
    var habits: [WorkspaceHabit]
    var lists: [WorkspaceTaxonomy]
    var tags: [WorkspaceTaxonomy]

    static let empty = TaskWorkspace(
        version: 2,
        updatedAt: RootineDate.isoTimestamp(),
        tasks: [],
        habits: [],
        lists: [],
        tags: []
    )

    init(
        version: Int,
        updatedAt: String,
        tasks: [WorkspaceTask],
        habits: [WorkspaceHabit],
        lists: [WorkspaceTaxonomy],
        tags: [WorkspaceTaxonomy]
    ) {
        self.version = version
        self.updatedAt = updatedAt
        self.tasks = tasks
        self.habits = habits
        self.lists = lists
        self.tags = tags
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let version = try container.decode(Int.self, forKey: .version)
        let updatedAt = try container.decode(String.self, forKey: .updatedAt)
        let decodedTasks = try container.decode([WorkspaceTask].self, forKey: .tasks)
        let tasks: [WorkspaceTask]
        if version == 1 {
            let timezone = TimeZone.current.identifier
            tasks = decodedTasks.map { task in
                guard task.schedule == nil, task.calendarDate != nil else { return task }
                return WorkspaceTask(
                    id: task.id,
                    text: task.text,
                    done: task.done,
                    completedAt: task.completedAt,
                    time: task.time,
                    endTime: task.endTime,
                    tags: task.tags,
                    list: task.list,
                    view: task.view,
                    priority: task.priority,
                    notes: task.notes,
                    deleted: task.deleted,
                    calendarDate: task.calendarDate,
                    date: task.date,
                    subtasks: task.subtasks,
                    comments: task.comments,
                    schedule: WorkspaceTaskSchedule(
                        allDay: task.time == nil,
                        startTime: task.time ?? "",
                        endTime: task.time == nil ? nil : task.endTime,
                        timezone: timezone
                    ),
                    source: task.source
                )
            }
        } else {
            tasks = decodedTasks
        }
        let value = TaskWorkspace(
            version: version == 1 ? 2 : version,
            updatedAt: updatedAt,
            tasks: tasks,
            habits: try container.decode([WorkspaceHabit].self, forKey: .habits),
            lists: try container.decode([WorkspaceTaxonomy].self, forKey: .lists),
            tags: try container.decode([WorkspaceTaxonomy].self, forKey: .tags)
        )
        try RootineTaskDomain.validate(value)
        self = value
    }
}

enum RootineTaskValidationError: Error, Equatable, LocalizedError, Sendable {
    case invalidWorkspaceVersion(Int)
    case invalidUpdatedAt
    case duplicateIdentifier(collection: String, id: Int)
    case duplicateTaxonomyIdentifier(collection: String, id: String)
    case invalidTask(id: Int, reason: String)
    case invalidHabit(id: Int, reason: String)

    var errorDescription: String? {
        switch self {
        case .invalidWorkspaceVersion(let version): return "Unsupported task workspace version \(version)."
        case .invalidUpdatedAt: return "Task workspace has an invalid updatedAt timestamp."
        case .duplicateIdentifier(let collection, let id): return "Duplicate \(collection) identifier \(id)."
        case .duplicateTaxonomyIdentifier(let collection, let id): return "Duplicate \(collection) identifier \(id)."
        case .invalidTask(let id, let reason): return "Task \(id) is invalid: \(reason)."
        case .invalidHabit(let id, let reason): return "Habit \(id) is invalid: \(reason)."
        }
    }
}

/// Validation shared by decoding, local writes, archive imports, and tests.
/// The JSON contract remains intentionally open to web-only keys (Swift's
/// Codable safely ignores unknown keys), while values represented by the
/// native model must satisfy the same date/time/range invariants as the web.
enum RootineTaskDomain {
    static func validate(_ workspace: TaskWorkspace) throws {
        guard workspace.version == 2 else {
            throw RootineTaskValidationError.invalidWorkspaceVersion(workspace.version)
        }
        guard RootineDate.date(from: workspace.updatedAt) != nil else {
            throw RootineTaskValidationError.invalidUpdatedAt
        }

        try uniqueIDs(workspace.tasks.map(\.id), collection: "task")
        try uniqueIDs(workspace.habits.map(\.id), collection: "habit")
        try uniqueTaxonomyIDs(workspace.lists.map(\.id), collection: "list")
        try uniqueTaxonomyIDs(workspace.tags.map(\.id), collection: "tag")
        for task in workspace.tasks { try validate(task) }
        for habit in workspace.habits { try validate(habit) }
    }

    static func validate(_ task: WorkspaceTask) throws {
        guard !task.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw RootineTaskValidationError.invalidTask(id: task.id, reason: "empty text")
        }
        if let completedAt = task.completedAt, RootineDate.date(from: completedAt) == nil {
            throw RootineTaskValidationError.invalidTask(id: task.id, reason: "invalid completedAt")
        }
        if let date = task.calendarDate, !RootineDate.isLocalDateKey(date) {
            throw RootineTaskValidationError.invalidTask(id: task.id, reason: "invalid calendarDate")
        }
        if let date = task.date, !date.isEmpty, date.count > 120 {
            throw RootineTaskValidationError.invalidTask(id: task.id, reason: "invalid date label")
        }
        if let time = task.time, !time.isEmpty, !RootineDate.isClockTime(time) {
            throw RootineTaskValidationError.invalidTask(id: task.id, reason: "invalid time")
        }
        if let endTime = task.endTime, !endTime.isEmpty, !RootineDate.isClockTime(endTime) {
            throw RootineTaskValidationError.invalidTask(id: task.id, reason: "invalid endTime")
        }
        if let schedule = task.schedule {
            do {
                try validate(schedule, taskDate: task.calendarDate)
            } catch let error as RootineTaskValidationError {
                throw error
            } catch {
                throw RootineTaskValidationError.invalidTask(id: task.id, reason: "invalid schedule")
            }
        }
        if let source = task.source {
            let allowedKinds = ["work", "travel", "sport", "goals", "affairs", "notes"]
            let entityParts = source.entity.split(separator: "/", omittingEmptySubsequences: true)
            let path = URL(string: source.href, relativeTo: URL(string: "https://rootine.local")!)?.path
            let validPath: Bool
            switch source.kind {
            case "work": validPath = path == "/praca"
            case "travel": validPath = path.map { $0.split(separator: "/").count == 2 && $0.hasPrefix("/podroze/") } == true
            case "sport": validPath = path == "/sport"
            case "goals": validPath = path == "/cele" || path?.hasPrefix("/cele/") == true
            case "affairs": validPath = path == "/sprawy"
            case "notes": validPath = path == "/notatki"
            default: validPath = false
            }
            guard allowedKinds.contains(source.kind),
                  entityParts.count == 2,
                  entityParts.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }),
                  !source.context.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  source.href.hasPrefix("/"),
                  !source.href.hasPrefix("//"),
                  !source.href.contains("\n"),
                  validPath,
                  source.managed == nil || ["projection", "native"].contains(source.managed!)
            else {
                throw RootineTaskValidationError.invalidTask(id: task.id, reason: "invalid source")
            }
        }
        if let subtasks = task.subtasks {
            let ids = subtasks.map(\.id)
            guard Set(ids).count == ids.count,
                  subtasks.allSatisfy({ !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
            else { throw RootineTaskValidationError.invalidTask(id: task.id, reason: "invalid subtasks") }
        }
        if let comments = task.comments {
            let ids = comments.map(\.id)
            guard Set(ids).count == ids.count,
                  comments.allSatisfy({ !$0.author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
            else { throw RootineTaskValidationError.invalidTask(id: task.id, reason: "invalid comments") }
        }
    }

    static func validate(_ schedule: WorkspaceTaskSchedule, taskDate: String? = nil) throws {
        if schedule.allDay {
            guard schedule.startTime.isEmpty, schedule.endTime == nil else {
                throw RootineTaskValidationError.invalidTask(id: 0, reason: "all-day schedule has a clock time")
            }
        } else {
            guard RootineDate.isClockTime(schedule.startTime) else {
                throw RootineTaskValidationError.invalidTask(id: 0, reason: "invalid schedule startTime")
            }
            if let endTime = schedule.endTime {
                guard RootineDate.isClockTime(endTime) else {
                    throw RootineTaskValidationError.invalidTask(id: 0, reason: "invalid schedule endTime")
                }
                if schedule.endDate == nil && endTime <= schedule.startTime {
                    throw RootineTaskValidationError.invalidTask(id: 0, reason: "same-day schedule ends before it starts")
                }
            }
        }
        if let endDate = schedule.endDate {
            guard RootineDate.isLocalDateKey(endDate),
                  taskDate == nil || endDate >= taskDate! else {
                throw RootineTaskValidationError.invalidTask(id: 0, reason: "invalid schedule endDate")
            }
        }
        if let reminder = schedule.reminderMinutes, reminder < 0 {
            throw RootineTaskValidationError.invalidTask(id: 0, reason: "negative reminder")
        }
        if let recurrence = schedule.recurrence, TaskRecurrence(rawValue: recurrence) == nil {
            throw RootineTaskValidationError.invalidTask(id: 0, reason: "invalid recurrence")
        }
        if let dates = schedule.completedDates {
            guard dates.allSatisfy(RootineDate.isLocalDateKey), Set(dates).count == dates.count else {
                throw RootineTaskValidationError.invalidTask(id: 0, reason: "invalid completion dates")
            }
        }
        if let timestamps = schedule.completedAtByDate {
            guard timestamps.allSatisfy({ RootineDate.isLocalDateKey($0.key) && RootineDate.date(from: $0.value) != nil }) else {
                throw RootineTaskValidationError.invalidTask(id: 0, reason: "invalid completion timestamps")
            }
        }
        guard !schedule.timezone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              TimeZone(identifier: schedule.timezone) != nil else {
            throw RootineTaskValidationError.invalidTask(id: 0, reason: "invalid timezone")
        }
    }

    static func validate(_ habit: WorkspaceHabit) throws {
        guard !habit.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              habit.streak >= 0 else {
            throw RootineTaskValidationError.invalidHabit(id: habit.id, reason: "invalid name or streak")
        }
        if let dates = habit.completedDates {
            guard dates.allSatisfy(RootineDate.isLocalDateKey), Set(dates).count == dates.count else {
                throw RootineTaskValidationError.invalidHabit(id: habit.id, reason: "invalid completion dates")
            }
        }
        if let time = habit.time, !time.isEmpty, !RootineDate.isClockTime(time) {
            throw RootineTaskValidationError.invalidHabit(id: habit.id, reason: "invalid time")
        }
        if let schedule = habit.schedule {
            guard let type = schedule.validatedType,
                  RootineDate.isLocalDateKey(schedule.startDate),
                  schedule.endDate == nil || (RootineDate.isLocalDateKey(schedule.endDate!) && schedule.endDate! >= schedule.startDate)
            else { throw RootineTaskValidationError.invalidHabit(id: habit.id, reason: "invalid schedule") }
            if type == .weekly {
                guard let weekdays = schedule.weekdays, !weekdays.isEmpty,
                      weekdays.allSatisfy({ (1...7).contains($0) }), Set(weekdays).count == weekdays.count
                else { throw RootineTaskValidationError.invalidHabit(id: habit.id, reason: "invalid weekdays") }
            }
            if type == .interval {
                guard let interval = schedule.interval, interval >= 1 else {
                    throw RootineTaskValidationError.invalidHabit(id: habit.id, reason: "invalid interval")
                }
            }
        }
        if let reminder = habit.reminderMinutes, reminder < 0 {
            throw RootineTaskValidationError.invalidHabit(id: habit.id, reason: "negative reminder")
        }
        if let periods = habit.pausePeriods {
            guard periods.allSatisfy({
                RootineDate.isLocalDateKey($0.startDate)
                    && ($0.endDate == nil || (RootineDate.isLocalDateKey($0.endDate!) && $0.endDate! >= $0.startDate))
            }) else { throw RootineTaskValidationError.invalidHabit(id: habit.id, reason: "invalid pause period") }
        }
    }

    private static func uniqueIDs(_ ids: [Int], collection: String) throws {
        guard Set(ids).count == ids.count else {
            let duplicate = ids.first { id in ids.filter { $0 == id }.count > 1 } ?? 0
            throw RootineTaskValidationError.duplicateIdentifier(collection: collection, id: duplicate)
        }
    }

    private static func uniqueTaxonomyIDs(_ ids: [String], collection: String) throws {
        guard Set(ids).count == ids.count else {
            let duplicate = ids.first { id in ids.filter { $0 == id }.count > 1 } ?? ""
            throw RootineTaskValidationError.duplicateTaxonomyIdentifier(collection: collection, id: duplicate)
        }
    }
}

func rootineNormalizedTaskWorkspace(
    _ workspace: TaskWorkspace,
    referenceDate: String = RootineDate.localDate()
) -> TaskWorkspace {
    var normalized = workspace
    normalized.habits = workspace.habits.map { rootineNormalizedHabit($0, referenceDate: referenceDate) }
    return normalized
}

func rootineValidHabitSchedule(_ schedule: WorkspaceHabitSchedule) -> Bool {
    guard let type = schedule.validatedType,
          RootineDate.isLocalDateKey(schedule.startDate),
          schedule.endDate == nil || (RootineDate.isLocalDateKey(schedule.endDate!) && schedule.endDate! >= schedule.startDate)
    else { return false }
    switch type {
    case .daily:
        return schedule.weekdays == nil || (!schedule.weekdays!.isEmpty
            && schedule.weekdays!.allSatisfy { (1...7).contains($0) }
            && Set(schedule.weekdays!).count == schedule.weekdays!.count)
    case .weekly:
        guard let weekdays = schedule.weekdays else { return false }
        return !weekdays.isEmpty && weekdays.allSatisfy { (1...7).contains($0) } && Set(weekdays).count == weekdays.count
    case .interval:
        return (schedule.interval ?? 0) >= 1
    }
}

func rootineValidTaskSchedule(_ schedule: WorkspaceTaskSchedule, taskDate: String? = nil) -> Bool {
    do {
        try RootineTaskDomain.validate(schedule, taskDate: taskDate)
        return true
    } catch {
        return false
    }
}

struct NutritionValues: Codable, Equatable, Sendable {
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
}

/// Resolves the values submitted by the nutrition editor. A catalog product
/// may provide a calculated baseline, but a person who changes a macro field
/// must never lose that explicit override when the form is saved. Keeping this
/// policy at the model boundary makes the view and its tests use the exact
/// same tolerance rules.
func rootineResolvedNutritionValues(
    generated: NutritionValues?,
    entered: NutritionValues,
    scaled: NutritionValues?
) -> NutritionValues {
    guard let generated, let scaled else { return entered }
    let matchesGenerated = abs(entered.calories - generated.calories) < 0.6
        && abs(entered.protein - generated.protein) < 0.06
        && abs(entered.carbs - generated.carbs) < 0.06
        && abs(entered.fat - generated.fat) < 0.06
    return matchesGenerated ? scaled : entered
}

/// The amount typed in the nutrition editor is the source of truth for a
/// catalog entry. Keeping the parser next to the model makes the same
/// amount/unit semantics available to the view and persistence layer.
struct NutritionPortion: Equatable, Sendable {
    let amount: Double?
    let unit: String?

    static func parse(
        _ value: String,
        fallbackAmount: Double? = nil,
        fallbackUnit: String? = nil
    ) -> NutritionPortion {
        let normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")
        guard !normalized.isEmpty else {
            return NutritionPortion(amount: fallbackAmount, unit: fallbackUnit)
        }

        let tokens = normalized.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard let first = tokens.first else {
            return NutritionPortion(amount: fallbackAmount, unit: fallbackUnit)
        }

        // Accept both “120 g” and compact input such as “120g”. A second
        // numeric token is treated as a thousands separator ("1 250 ml").
        var numericToken = first
        var consumedTokens = 1
        if tokens.count > 1,
           Double(numericToken) != nil,
           Double(tokens[1]) != nil {
            numericToken += tokens[1]
            consumedTokens = 2
        }

        let numericPrefix = numericToken.prefix { character in
            character.isNumber || character == "." || character == "-"
        }
        guard let parsedAmount = Double(numericPrefix), parsedAmount >= 0 else {
            return NutritionPortion(amount: fallbackAmount, unit: fallbackUnit)
        }

        var unitParts: [String] = []
        let inlineUnit = String(numericToken.dropFirst(numericPrefix.count))
        if !inlineUnit.isEmpty { unitParts.append(inlineUnit) }
        if tokens.count > consumedTokens {
            unitParts.append(contentsOf: tokens.dropFirst(consumedTokens))
        }
        let parsedUnit = unitParts.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        return NutritionPortion(
            amount: parsedAmount,
            unit: parsedUnit.isEmpty ? fallbackUnit : parsedUnit
        )
    }

    /// Nutrition catalog values are expressed per 100 g/ml. Count-based
    /// units (szt., porcja, etc.) are expressed per one item and scale by the
    /// entered count.
    static func multiplier(amount: Double?, unit: String?) -> Double {
        guard let amount, amount >= 0 else { return 1 }
        let normalizedUnit: String?
        if let unit {
            normalizedUnit = unit
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .split(whereSeparator: { $0.isWhitespace })
                .first
                .map(String.init)
                .map { $0.replacingOccurrences(of: ".", with: "") }
        } else {
            normalizedUnit = nil
        }
        switch normalizedUnit {
        case "g", "gram", "grams", "gramy", "ml", "millilitr", "millilitry":
            return amount / 100
        case "kg", "kilogram", "kilogramy", "l", "litr", "litry":
            return amount * 10
        case "dag", "dkg":
            return amount / 10
        default:
            return amount
        }
    }
}

struct NutritionBarcodeRequest: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var barcode: String
    var createdAt: String
    var lastAttemptAt: String? = nil
    var attemptCount: Int = 0
    /// A successful lookup stays durable until the user consumes it in the
    /// add-entry flow. This prevents a background retry from finding a
    /// product and then losing it before the person can act on the result.
    var resolvedProduct: NutritionProduct? = nil
}

enum NutritionScanResult: Equatable, Sendable {
    case productCode(String)
    case malformed
    case unsupported
}

/// Canonicalizes values emitted by both 1D barcode and QR metadata readers.
///
/// Camera metadata is text, not an image. The parser intentionally accepts
/// only GTIN product codes or a small, versioned Rootine envelope; arbitrary
/// URLs and payloads are never opened or sent to a server.
enum NutritionBarcode {
    /// Keep only stable barcode characters so legacy queue entries and scanner
    /// separators cannot create duplicate pending requests. This remains
    /// permissive for migration of old local v6 snapshots; new scan input must
    /// go through `parseScanPayload(_:)` and its strict GTIN validation.
    static func normalized(_ value: String) -> String {
        value
            .uppercased()
            .filter { $0.isLetter || $0.isNumber }
    }

    /// Returns a validated EAN/UPC/GTIN code, preserving the scanned width
    /// except for UPC-E, which is expanded to its canonical UPC-A value.
    /// Separators commonly added by handheld scanners are tolerated, while
    /// letters, URLs and partial codes are rejected. AIM symbology prefixes
    /// (`]E0`, `]E4`, `]C0`, `]C1`) are accepted when a scanner includes one.
    static func normalizedProductCode(_ value: String) -> String? {
        var candidate = value.trimmingCharacters(in: .whitespacesAndNewlines)
        for prefix in ["]E0", "]E4", "]C0", "]C1"] where candidate.uppercased().hasPrefix(prefix) {
            candidate = String(candidate.dropFirst(prefix.count))
            break
        }
        candidate = candidate.filter { !$0.isWhitespace && $0 != "-" }
        guard [8, 12, 13, 14].contains(candidate.count),
              candidate.unicodeScalars.allSatisfy({ $0.value >= 48 && $0.value <= 57 }),
              !candidate.isEmpty else { return nil }
        if hasValidCheckDigit(candidate) { return candidate }
        // UPC-E is an eight-digit compressed UPC-A representation. Prefer a
        // regular GTIN-8 when both interpretations are possible, then expand
        // a valid UPC-E to the 12-digit value accepted by catalog endpoints.
        guard candidate.count == 8, let expanded = expandUPCE(candidate) else { return nil }
        return expanded
    }

    /// Parses raw camera/manual input. A numeric QR and a 1D barcode both
    /// resolve to the same product-code case; the backend lookup is therefore
    /// deterministic regardless of which metadata symbology produced it.
    static func parseScanPayload(_ value: String) -> NutritionScanResult {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .malformed }
        if let code = normalizedProductCode(trimmed) { return .productCode(code) }
        if looksLikeProductCode(trimmed) { return .malformed }

        if let code = parseRootineEnvelope(trimmed) {
            return .productCode(code)
        }
        if looksLikeURL(trimmed) {
            return parseRootineURL(trimmed).map(NutritionScanResult.productCode) ?? .unsupported
        }
        return .unsupported
    }

    static func requestID(for barcode: String) -> String {
        RootineLocalIdentifier.string(namespace: "nutrition-barcode", operationID: normalized(barcode))
    }

    private static let trustedRootineHosts: Set<String> = [
        "rootine.app",
        "www.rootine.app",
        "app.rootine.app"
    ]

    private static func hasValidCheckDigit(_ code: String) -> Bool {
        let digits = code.compactMap { Int(String($0)) }
        guard digits.count == code.count, let check = digits.last else { return false }
        let sum = digits.dropLast().reversed().enumerated().reduce(0) { total, item in
            total + item.element * (item.offset.isMultiple(of: 2) ? 3 : 1)
        }
        return (10 - (sum % 10)) % 10 == check
    }

    private static func expandUPCE(_ code: String) -> String? {
        let digits = code.compactMap { Int(String($0)) }
        guard digits.count == 8, [0, 1].contains(digits[0]) else { return nil }
        let numberSystem = String(digits[0])
        let data = digits[1...6].map(String.init)
        let checkDigit = String(digits[7])
        let manufacturer: String
        let product: String
        switch digits[6] {
        case 0...2:
            manufacturer = data[0] + data[1] + data[5] + "0000"
            product = data[2] + data[3] + data[4]
        case 3:
            manufacturer = data[0] + data[1] + data[2] + "00000"
            product = data[3] + data[4]
        case 4:
            manufacturer = data[0] + data[1] + data[2] + data[3] + "00000"
            product = data[4]
        default:
            manufacturer = data[0] + data[1] + data[2] + data[3] + data[4] + "0000"
            product = data[5]
        }
        let expanded = numberSystem + manufacturer + product + checkDigit
        return hasValidCheckDigit(expanded) ? expanded : nil
    }

    private static func looksLikeURL(_ value: String) -> Bool {
        value.range(of: "://") != nil || value.lowercased().hasPrefix("rootine:")
    }

    private static func looksLikeProductCode(_ value: String) -> Bool {
        var candidate = value.trimmingCharacters(in: .whitespacesAndNewlines)
        for prefix in ["]E0", "]E4", "]C0", "]C1"] where candidate.uppercased().hasPrefix(prefix) {
            candidate = String(candidate.dropFirst(prefix.count))
            break
        }
        candidate = candidate.filter { !$0.isWhitespace && $0 != "-" }
        return !candidate.isEmpty
            && candidate.unicodeScalars.allSatisfy({ $0.value >= 48 && $0.value <= 57 })
    }

    private static func parseRootineURL(_ rawValue: String) -> String? {
        guard let components = URLComponents(string: rawValue),
              let scheme = components.scheme?.lowercased(),
              components.user == nil,
              components.password == nil,
              components.port == nil,
              components.fragment == nil else { return nil }

        let path = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
        let host = components.host?.lowercased()
        let trusted: Bool
        if scheme == "rootine" {
            trusted = host == "nutrition" && path == "product"
                || host == nil && path == "nutrition/product"
        } else if scheme == "https" {
            trusted = host.map { trustedRootineHosts.contains($0) } == true
                && ["product", "nutrition/product"].contains(path)
        } else {
            trusted = false
        }
        guard trusted, let code = singleProductCode(from: components.queryItems ?? []) else { return nil }
        return code
    }

    private static func singleProductCode(from items: [URLQueryItem]) -> String? {
        let acceptedNames = Set(["code", "barcode", "gtin", "ean", "upc"])
        let candidates = items
            .filter { acceptedNames.contains($0.name.lowercased()) }
            .compactMap(\.value)
            .filter { !$0.isEmpty }
        guard candidates.count == 1 else { return nil }
        return normalizedProductCode(candidates[0])
    }

    private static func parseRootineEnvelope(_ rawValue: String) -> String? {
        let prefix = "rootine:nutrition:v1:"
        if rawValue.lowercased().hasPrefix(prefix) {
            return normalizedProductCode(String(rawValue.dropFirst(prefix.count)))
        }

        guard rawValue.first == "{", rawValue.last == "}",
              let data = rawValue.data(using: .utf8),
              let payload = try? JSONDecoder().decode(RootineNutritionPayload.self, from: data),
              payload.version == 1,
              ["rootine.nutrition.product", "rootine/nutrition/product"].contains(payload.type.lowercased()),
              let rawCode = payload.code ?? payload.barcode ?? payload.gtin else { return nil }
        return normalizedProductCode(rawCode)
    }

    private struct RootineNutritionPayload: Decodable {
        let type: String
        let version: Int
        let code: String?
        let barcode: String?
        let gtin: String?
    }
}

struct NutritionEntry: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var portion: String
    var amount: Double? = nil
    var unit: String? = nil
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var brand: String? = nil
    var catalogId: String? = nil
    var catalogSource: String? = nil
    var per100g: NutritionValues? = nil
    var createdAt: String
    var updatedAt: String? = nil
}

struct NutritionMealEntries: Codable, Equatable, Sendable {
    var breakfast: [NutritionEntry]
    var lunch: [NutritionEntry]
    var snack: [NutritionEntry]
    var dinner: [NutritionEntry]
}

struct NutritionDay: Codable, Equatable, Sendable {
    var date: String
    var waterMl: Double
    var source: String
    var closedAt: String? = nil
    var entries: NutritionMealEntries

    static func empty(date: String) -> NutritionDay {
        NutritionDay(
            date: date,
            waterMl: 0,
            source: "user",
            entries: NutritionMealEntries(breakfast: [], lunch: [], snack: [], dinner: [])
        )
    }
}

struct NutritionGoals: Codable, Equatable, Sendable {
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var waterMl: Double
}

struct NutritionActivity: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var type: String
    var intensity: String
    var timesPerWeek: Double
    var minutesPerSession: Double
}

struct NutritionCalculatorProfile: Codable, Equatable, Sendable {
    var equationVariant: String
    var age: Double
    var weightKg: Double
    var heightCm: Double
    var workActivity: String
    var activities: [NutritionActivity]
    var dietAdjustmentMode: String
    var dietAdjustmentValue: Double
}

struct MacroConfiguration: Codable, Equatable, Sendable {
    var mode: String
    var preset: String
    var proteinPercent: Double
    var carbsPercent: Double
    var fatPercent: Double
}

struct WeightMeasurement: Codable, Equatable, Sendable {
    var date: String
    var weightKg: Double
    var note: String? = nil
    var createdAt: String
    var updatedAt: String? = nil
}

struct BodyMeasurement: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var date: String
    var type: String
    var valueCm: Double
    var note: String? = nil
    var createdAt: String
}

struct CustomMealIngredient: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var brand: String? = nil
    var amount: Double
    var unit: String
    var per100g: NutritionValues
    var catalogId: String? = nil
    var catalogSource: String? = nil
}

struct CustomMeal: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var ingredients: [CustomMealIngredient]
    var totalWeightG: Double? = nil
    var servings: Double? = nil
    var createdAt: String
    var updatedAt: String? = nil
}

struct NutritionWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var goals: NutritionGoals
    var calculatorProfile: NutritionCalculatorProfile? = nil
    var macroConfiguration: MacroConfiguration
    var weightMeasurements: [String: WeightMeasurement]
    var bodyMeasurements: [String: [BodyMeasurement]]? = nil
    var customMeals: [CustomMeal]? = nil
    var days: [String: NutritionDay]
    /// A camera lookup is persisted with the nutrition workspace before any
    /// network request. Optional keeps v6 payloads backward compatible.
    var pendingBarcodeLookups: [NutritionBarcodeRequest]? = nil

    static let empty = NutritionWorkspace(
        version: 6,
        updatedAt: RootineDate.isoTimestamp(),
        goals: NutritionGoals(calories: 2300, protein: 150, carbs: 270, fat: 75, waterMl: 2000),
        macroConfiguration: MacroConfiguration(mode: "grams", preset: "balanced", proteinPercent: 25, carbsPercent: 45, fatPercent: 30),
        weightMeasurements: [:],
        bodyMeasurements: [:],
        customMeals: [],
        days: [:],
        pendingBarcodeLookups: []
    )
}

enum NoteColor: String, Codable, CaseIterable, Sendable {
    case graphite
    case blue
    case green
    case amber
    case violet
    case coral
}

struct NoteChecklistItem: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var text: String
    var checked: Bool
}

struct NoteList: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var createdAt: String
}

struct NoteRecord: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var body: String
    var kind: String
    var items: [NoteChecklistItem]
    var tags: [String]
    var listId: String
    var color: NoteColor
    var pinned: Bool
    var archived: Bool
    var createdAt: String
    var updatedAt: String
}

struct NotesWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var lists: [NoteList]
    var notes: [NoteRecord]

    static let empty = NotesWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), lists: [], notes: [])
}

enum RootineNotesSort: String, CaseIterable, Sendable {
    case updated
    case created
    case title
}

struct RootineNotesQuery: Equatable, Sendable {
    var search = ""
    var listID: String?
    var tag: String?
    var showingArchive = false
    var pinnedOnly = false
    var sort: RootineNotesSort = .updated

    init(
        search: String = "",
        listID: String? = nil,
        tag: String? = nil,
        showingArchive: Bool = false,
        pinnedOnly: Bool = false,
        sort: RootineNotesSort = .updated
    ) {
        self.search = search
        self.listID = listID
        self.tag = tag
        self.showingArchive = showingArchive
        self.pinnedOnly = pinnedOnly
        self.sort = sort
    }
}

/// Shared filtering/sorting semantics for the iOS Notes surface. Keeping the
/// query pure makes search, folders, pinning and archive behavior consistent
/// in the UI and easy to verify without a view or a live account.
func rootineNotes(_ workspace: NotesWorkspace, matching query: RootineNotesQuery = RootineNotesQuery()) -> [NoteRecord] {
    let normalizedSearch = query.search.trimmingCharacters(in: .whitespacesAndNewlines)
    let notes = workspace.notes.filter { note in
        guard note.archived == query.showingArchive else { return false }
        if query.pinnedOnly && !note.pinned { return false }
        if let listID = query.listID, note.listId != listID { return false }
        if let tag = query.tag,
           !note.tags.contains(where: { $0.localizedCaseInsensitiveCompare(tag) == .orderedSame }) { return false }
        guard !normalizedSearch.isEmpty else { return true }
        let searchable = ([note.title, note.body] + note.tags + note.items.map(\.text)).joined(separator: " ")
        return searchable.localizedCaseInsensitiveContains(normalizedSearch)
    }
    return notes.sorted { lhs, rhs in
        let order: ComparisonResult
        switch query.sort {
        case .title: order = lhs.title.localizedCaseInsensitiveCompare(rhs.title)
        case .created: order = rhs.createdAt.localizedCaseInsensitiveCompare(lhs.createdAt)
        case .updated: order = rhs.updatedAt.localizedCaseInsensitiveCompare(lhs.updatedAt)
        }
        if order != .orderedSame { return order == .orderedAscending }
        if lhs.pinned != rhs.pinned { return lhs.pinned }
        return lhs.id < rhs.id
    }
}

// MARK: More workspaces

/// The More modules use small, independent snapshots. This keeps each module
/// independently syncable and allows a future server contract to evolve
/// without coupling unrelated feature data.
struct SportWorkout: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var date: String
    var minutes: Int
    var kind: String
    var completed: Bool
    var createdAt: String
    /// Optional for backwards-compatible decoding of v1 native snapshots.
    /// New mutations carry the same timestamp into canonical Sport records.
    var updatedAt: String? = nil
}

struct SportWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var workouts: [SportWorkout]

    static let empty = SportWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), workouts: [])
}

enum GoalStatus: String, Codable, CaseIterable, Sendable {
    case planned
    case active
    case paused
    case completed
    case archived
}

enum GoalHealth: String, Codable, CaseIterable, Sendable {
    case ontrack
    case risk
}

enum GoalPriority: String, Codable, CaseIterable, Sendable {
    case high
    case medium
    case low
}

enum GoalProgressMode: String, Codable, CaseIterable, Sendable {
    case numeric
    case milestones
    case regularity
    case manual
}

enum GoalRegularityMode: String, Codable, CaseIterable, Sendable {
    case streak
    case frequency
}

enum GoalRegularityPeriod: String, Codable, CaseIterable, Sendable {
    case day
    case week
    case month
}

struct GoalCategory: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var label: String
    var color: String
    var iconKey: String

    init(id: String, label: String, color: String, iconKey: String) {
        self.id = id
        self.label = label
        self.color = color
        self.iconKey = iconKey
    }
}

struct GoalMilestone: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var note: String
    var dueDate: String
    var done: Bool
    var completedAt: String?
    var weight: Double
    var order: Int?
    var isNext: Bool?
    var linkedTaskIds: [Int]

    init(
        id: String,
        title: String,
        note: String = "",
        dueDate: String,
        done: Bool = false,
        completedAt: String? = nil,
        weight: Double = 1,
        order: Int? = nil,
        isNext: Bool? = nil,
        linkedTaskIds: [Int] = []
    ) {
        self.id = id
        self.title = title
        self.note = note
        self.dueDate = dueDate
        self.done = done
        self.completedAt = completedAt
        self.weight = weight
        self.order = order
        self.isNext = isNext
        self.linkedTaskIds = linkedTaskIds
    }

    enum CodingKeys: String, CodingKey {
        case id, title, note, dueDate, done, completedAt, weight, order, isNext, linkedTaskIds
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        note = try container.decodeIfPresent(String.self, forKey: .note) ?? ""
        dueDate = try container.decode(String.self, forKey: .dueDate)
        done = try container.decode(Bool.self, forKey: .done)
        completedAt = try container.decodeIfPresent(String.self, forKey: .completedAt)
        weight = try container.decodeIfPresent(Double.self, forKey: .weight) ?? 1
        order = try container.decodeIfPresent(Int.self, forKey: .order)
        isNext = try container.decodeIfPresent(Bool.self, forKey: .isNext)
        linkedTaskIds = try container.decodeIfPresent([Int].self, forKey: .linkedTaskIds) ?? []
    }
}

struct GoalProgressEntry: Codable, Equatable, Identifiable, Sendable {
    enum Kind: String, Codable, CaseIterable, Sendable {
        case absolute
        case delta
    }

    var id: String
    var date: String
    var value: Double
    var kind: Kind
    var note: String
    var createdAt: String

    init(id: String, date: String, value: Double, kind: Kind = .absolute, note: String = "", createdAt: String) {
        self.id = id
        self.date = date
        self.value = value
        self.kind = kind
        self.note = note
        self.createdAt = createdAt
    }
}

struct GoalHistoryEntry: Codable, Equatable, Identifiable, Sendable {
    enum EntryType: String, Codable, CaseIterable, Sendable {
        case progress
        case stageCompleted = "stage_completed"
        case stageAdded = "stage_added"
        case deadlineChanged = "deadline_changed"
        case statusChanged = "status_changed"
        case noteAdded = "note_added"
        case resumed
        case paused
        case updated
    }

    var id: String
    var type: EntryType
    var label: String
    var detail: String?
    var createdAt: String

    init(id: String, type: EntryType = .updated, label: String, detail: String? = nil, createdAt: String) {
        self.id = id
        self.type = type
        self.label = label
        self.detail = detail
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey {
        case id, type, label, detail, createdAt, date
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        type = try container.decodeIfPresent(EntryType.self, forKey: .type) ?? .updated
        label = try container.decode(String.self, forKey: .label)
        detail = try container.decodeIfPresent(String.self, forKey: .detail)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .date))
            ?? RootineDate.isoTimestamp()
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(type, forKey: .type)
        try container.encode(label, forKey: .label)
        try container.encodeIfPresent(detail, forKey: .detail)
        try container.encode(createdAt, forKey: .createdAt)
    }

    /// The v1 fixture used `date`; exposing it as an alias keeps old clients
    /// source-compatible without writing two competing timestamps.
    var date: String {
        get { createdAt }
        set { createdAt = newValue }
    }
}

struct GoalRecord: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var detail: String
    var current: Double
    var target: Double
    var icon: String
    var createdAt: String
    var updatedAt: String
    var categoryId: String
    var iconKey: String
    var customIcon: String?
    var color: String
    var status: GoalStatus
    var health: GoalHealth
    var priority: GoalPriority
    var startDate: String
    var dueDate: String
    var progressMode: GoalProgressMode
    var regularityMode: GoalRegularityMode?
    var frequencyTarget: Double?
    var frequencyPeriod: GoalRegularityPeriod?
    var initialValue: Double
    var targetValue: Double
    var unit: String
    var manualProgress: Double
    var milestones: [GoalMilestone]
    var progressEntries: [GoalProgressEntry]
    var linkedTaskIds: [Int]
    var history: [GoalHistoryEntry]
    var note: String

    /// Legacy native constructor used by earlier More-module screens.
    init(id: String, title: String, detail: String, current: Double, target: Double, icon: String, createdAt: String, updatedAt: String) {
        self.init(
            id: id,
            title: title,
            detail: detail,
            current: current,
            target: target,
            icon: icon,
            createdAt: createdAt,
            updatedAt: updatedAt,
            categoryId: "personal",
            iconKey: "target",
            customIcon: nil,
            color: "#7FA6C9",
            status: current >= target && target > 0 ? .completed : .active,
            health: .ontrack,
            priority: .medium,
            startDate: String(createdAt.prefix(10)),
            dueDate: String(updatedAt.prefix(10)),
            progressMode: .numeric,
            regularityMode: nil,
            frequencyTarget: nil,
            frequencyPeriod: nil,
            initialValue: 0,
            targetValue: max(1, target),
            unit: "kroków",
            manualProgress: 0,
            milestones: [],
            progressEntries: [GoalProgressEntry(id: "ios-progress-\(id)", date: String(updatedAt.prefix(10)), value: current, kind: .absolute, note: "Postęp z aplikacji iOS", createdAt: updatedAt)],
            linkedTaskIds: [],
            history: [],
            note: detail
        )
    }

    init(
        id: String,
        title: String,
        detail: String,
        current: Double = 0,
        target: Double = 1,
        icon: String = "target",
        createdAt: String,
        updatedAt: String,
        categoryId: String = "personal",
        iconKey: String = "target",
        customIcon: String? = nil,
        color: String = "#7FA6C9",
        status: GoalStatus = .active,
        health: GoalHealth = .ontrack,
        priority: GoalPriority = .medium,
        startDate: String? = nil,
        dueDate: String? = nil,
        progressMode: GoalProgressMode = .numeric,
        regularityMode: GoalRegularityMode? = nil,
        frequencyTarget: Double? = nil,
        frequencyPeriod: GoalRegularityPeriod? = nil,
        initialValue: Double = 0,
        targetValue: Double? = nil,
        unit: String = "kroków",
        manualProgress: Double = 0,
        milestones: [GoalMilestone] = [],
        progressEntries: [GoalProgressEntry] = [],
        linkedTaskIds: [Int] = [],
        history: [GoalHistoryEntry] = [],
        note: String = ""
    ) {
        self.id = id
        self.title = title
        self.detail = detail
        self.current = current
        self.target = max(1, target)
        self.icon = icon
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.categoryId = categoryId
        self.iconKey = iconKey
        self.customIcon = customIcon
        self.color = color
        self.status = status
        self.health = health
        self.priority = priority
        self.startDate = startDate ?? String(createdAt.prefix(10))
        self.dueDate = dueDate ?? String(updatedAt.prefix(10))
        self.progressMode = progressMode
        self.regularityMode = regularityMode
        self.frequencyTarget = frequencyTarget
        self.frequencyPeriod = frequencyPeriod
        self.initialValue = initialValue
        self.targetValue = max(0, targetValue ?? target)
        self.unit = unit
        self.manualProgress = manualProgress
        self.milestones = milestones
        self.progressEntries = progressEntries
        self.linkedTaskIds = linkedTaskIds
        self.history = history
        self.note = note
    }

    enum CodingKeys: String, CodingKey {
        case id, title, description, detail, current, target, icon, createdAt, updatedAt
        case categoryId, iconKey, customIcon, color, status, health, priority, startDate, dueDate
        case progressMode, regularityMode, frequencyTarget, frequencyPeriod, initialValue, targetValue
        case unit, manualProgress, milestones, progressEntries, linkedTaskIds, note, history
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        detail = try container.decodeIfPresent(String.self, forKey: .description)
            ?? (try container.decodeIfPresent(String.self, forKey: .detail))
            ?? ""
        let decodedEntries = try container.decodeIfPresent([GoalProgressEntry].self, forKey: .progressEntries) ?? []
        progressEntries = decodedEntries
        current = try container.decodeIfPresent(Double.self, forKey: .current)
            ?? rootineGoalCurrentValue(
                initialValue: try container.decodeIfPresent(Double.self, forKey: .initialValue) ?? 0,
                progressEntries: decodedEntries
            )
        target = max(1, try container.decodeIfPresent(Double.self, forKey: .target)
            ?? (try container.decodeIfPresent(Double.self, forKey: .targetValue))
            ?? 1)
        icon = try container.decodeIfPresent(String.self, forKey: .icon)
            ?? container.decodeIfPresent(String.self, forKey: .iconKey)
            ?? "target"
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? RootineDate.isoTimestamp()
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? createdAt
        categoryId = try container.decodeIfPresent(String.self, forKey: .categoryId) ?? "personal"
        iconKey = try container.decodeIfPresent(String.self, forKey: .iconKey) ?? "target"
        customIcon = try container.decodeIfPresent(String.self, forKey: .customIcon)
        color = try container.decodeIfPresent(String.self, forKey: .color) ?? "#7FA6C9"
        status = try container.decodeIfPresent(GoalStatus.self, forKey: .status) ?? (current >= target ? .completed : .active)
        health = try container.decodeIfPresent(GoalHealth.self, forKey: .health) ?? .ontrack
        priority = try container.decodeIfPresent(GoalPriority.self, forKey: .priority) ?? .medium
        startDate = try container.decodeIfPresent(String.self, forKey: .startDate) ?? String(createdAt.prefix(10))
        dueDate = try container.decodeIfPresent(String.self, forKey: .dueDate) ?? String(updatedAt.prefix(10))
        progressMode = try container.decodeIfPresent(GoalProgressMode.self, forKey: .progressMode) ?? .numeric
        regularityMode = try container.decodeIfPresent(GoalRegularityMode.self, forKey: .regularityMode)
        frequencyTarget = try container.decodeIfPresent(Double.self, forKey: .frequencyTarget)
        frequencyPeriod = try container.decodeIfPresent(GoalRegularityPeriod.self, forKey: .frequencyPeriod)
        initialValue = try container.decodeIfPresent(Double.self, forKey: .initialValue) ?? 0
        targetValue = max(0, try container.decodeIfPresent(Double.self, forKey: .targetValue) ?? target)
        unit = try container.decodeIfPresent(String.self, forKey: .unit) ?? "kroków"
        manualProgress = try container.decodeIfPresent(Double.self, forKey: .manualProgress) ?? 0
        milestones = try container.decodeIfPresent([GoalMilestone].self, forKey: .milestones) ?? []
        linkedTaskIds = try container.decodeIfPresent([Int].self, forKey: .linkedTaskIds) ?? []
        history = try container.decodeIfPresent([GoalHistoryEntry].self, forKey: .history) ?? []
        note = try container.decodeIfPresent(String.self, forKey: .note) ?? detail
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(title, forKey: .title)
        // `description` is the canonical contract name. The legacy aliases
        // remain encoded as well so older native snapshots can round-trip.
        try container.encode(detail, forKey: .description)
        try container.encode(detail, forKey: .detail)
        try container.encode(current, forKey: .current)
        try container.encode(target, forKey: .target)
        try container.encode(icon, forKey: .icon)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
        try container.encode(categoryId, forKey: .categoryId)
        try container.encode(iconKey, forKey: .iconKey)
        try container.encodeIfPresent(customIcon, forKey: .customIcon)
        try container.encode(color, forKey: .color)
        try container.encode(status, forKey: .status)
        try container.encode(health, forKey: .health)
        try container.encode(priority, forKey: .priority)
        try container.encode(startDate, forKey: .startDate)
        try container.encode(dueDate, forKey: .dueDate)
        try container.encode(progressMode, forKey: .progressMode)
        try container.encodeIfPresent(regularityMode, forKey: .regularityMode)
        try container.encodeIfPresent(frequencyTarget, forKey: .frequencyTarget)
        try container.encodeIfPresent(frequencyPeriod, forKey: .frequencyPeriod)
        try container.encode(initialValue, forKey: .initialValue)
        try container.encode(targetValue, forKey: .targetValue)
        try container.encode(unit, forKey: .unit)
        try container.encode(manualProgress, forKey: .manualProgress)
        try container.encode(milestones, forKey: .milestones)
        try container.encode(progressEntries, forKey: .progressEntries)
        try container.encode(linkedTaskIds, forKey: .linkedTaskIds)
        try container.encode(history, forKey: .history)
        try container.encode(note, forKey: .note)
    }

    var progress: Double { rootineGoalProgress(self) }
    var progressPercent: Int { rootineGoalProgressPercent(self) }
}

struct GoalsWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var goals: [GoalRecord]
    var categories: [GoalCategory]

    init(version: Int, updatedAt: String, goals: [GoalRecord], categories: [GoalCategory] = [GoalCategory(id: "personal", label: "Sprawy osobiste", color: "#8793A1", iconKey: "circle")]) {
        self.version = version
        self.updatedAt = updatedAt
        self.goals = goals
        self.categories = categories
    }

    enum CodingKeys: String, CodingKey { case version, updatedAt, goals, categories }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decode(Int.self, forKey: .version)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? RootineDate.isoTimestamp()
        goals = try container.decodeIfPresent([GoalRecord].self, forKey: .goals) ?? []
        categories = try container.decodeIfPresent([GoalCategory].self, forKey: .categories)
            ?? [GoalCategory(id: "personal", label: "Sprawy osobiste", color: "#8793A1", iconKey: "circle")]
    }

    static let empty = GoalsWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), goals: [])
}

private func rootineGoalCurrentValue(initialValue: Double, progressEntries: [GoalProgressEntry]) -> Double {
    progressEntries
        .sorted { lhs, rhs in
            let left = "\(lhs.date)|\(lhs.createdAt)|\(lhs.id)"
            let right = "\(rhs.date)|\(rhs.createdAt)|\(rhs.id)"
            return left < right
        }
        .reduce(initialValue) { current, entry in
            entry.kind == .absolute ? entry.value : current + entry.value
        }
}

func rootineGoalCurrentValue(_ goal: GoalRecord) -> Double {
    if goal.progressMode == .milestones {
        return goal.milestones.filter(\.done).reduce(0) { $0 + max(0, $1.weight) }
    }
    if goal.progressMode == .manual, goal.progressEntries.isEmpty {
        return goal.manualProgress
    }
    return rootineGoalCurrentValue(initialValue: goal.initialValue, progressEntries: goal.progressEntries)
}

func rootineGoalRegularityTarget(_ goal: GoalRecord) -> Double {
    guard goal.progressMode == .regularity, goal.regularityMode == .frequency else { return max(0, goal.targetValue) }
    let days = rootineGoalCalendarDaysInclusive(from: goal.startDate, to: goal.dueDate)
    let periods: Double
    switch goal.frequencyPeriod {
    case .month: periods = ceil(Double(days) / 30.44)
    case .week: periods = ceil(Double(days) / 7)
    default: periods = Double(days)
    }
    return max(1, (goal.frequencyTarget ?? 1) * periods)
}

func rootineGoalProgress(_ goal: GoalRecord) -> Double {
    if goal.progressMode == .milestones {
        let total = goal.milestones.reduce(0) { $0 + max(0, $1.weight) }
        guard total > 0 else { return 0 }
        return min(1, max(0, goal.milestones.filter(\.done).reduce(0) { $0 + max(0, $1.weight) } / total))
    }
    let target = goal.progressMode == .regularity ? rootineGoalRegularityTarget(goal) : goal.progressMode == .manual ? 100 : goal.targetValue
    guard target > 0 else { return 0 }
    let value = goal.progressMode == .manual && goal.progressEntries.isEmpty ? goal.manualProgress : rootineGoalCurrentValue(goal)
    return min(1, max(0, value / target))
}

func rootineGoalProgressPercent(_ goal: GoalRecord) -> Int {
    Int((rootineGoalProgress(goal) * 100).rounded(.toNearestOrAwayFromZero))
}

private func rootineGoalCalendarDaysInclusive(from start: String, to end: String) -> Int {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    guard let first = formatter.date(from: start), let last = formatter.date(from: end) else { return 1 }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    return max(1, calendar.dateComponents([.day], from: first, to: last).day.map { $0 + 1 } ?? 1)
}

// MARK: Work

enum WorkProjectStatus: String, Codable, CaseIterable, Hashable, Sendable {
    case active
    case paused
    case completed
    case archived

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = WorkProjectStatus(rawValue: raw) ?? .active
    }
}

enum WorkItemStatus: String, Codable, CaseIterable, Hashable, Sendable {
    case todo
    case inProgress = "in_progress"
    case blocked
    case waiting
    case completed
    case cancelled

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = WorkItemStatus(rawValue: raw) ?? .todo
    }
}

enum WorkItemPriority: String, Codable, CaseIterable, Hashable, Sendable {
    case none
    case low
    case medium
    case high
    case urgent

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = WorkItemPriority(rawValue: raw) ?? .none
    }
}

struct WorkCompany: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var description: String = ""
    var color: String = ""
    var website: String? = nil
    var archived: Bool = false
    var createdAt: String? = nil
    var updatedAt: String? = nil
}

struct WorkProject: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var companyId: String? = nil
    var name: String
    var description: String = ""
    var status: WorkProjectStatus = .active
    var startDate: String? = nil
    var endDate: String? = nil
    var note: String? = nil
    var createdAt: String? = nil
    var updatedAt: String? = nil
}

/// Native work item projection. It mirrors the v3 `work_tasks` collection;
/// unlike the compact global TaskWorkspace projection it keeps project and
/// hierarchy identity on the work document itself.
struct WorkItem: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var companyId: String? = nil
    var projectId: String? = nil
    var parentId: String? = nil
    var title: String
    var completed: Bool = false
    var status: WorkItemStatus = .todo
    var priority: WorkItemPriority = .none
    var startDate: String? = nil
    var dueDate: String? = nil
    var dueTime: String? = nil
    var note: String? = nil
    var createdAt: String
    var updatedAt: String? = nil
}

struct WorkFocusSession: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var startedAt: String
    var endedAt: String
    var minutes: Int
    var projectId: String? = nil
    var taskId: String? = nil
    var note: String? = nil
}

struct WorkWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var activeFocusStartedAt: String?
    var activeFocusProjectID: String?
    var activeFocusTaskID: String?
    /// Set when a focus segment was paused. The completed segment remains in
    /// `focusSessions`, while this marker lets the native surface distinguish
    /// resume from a brand-new session after a relaunch.
    var pausedFocusSessionID: String?
    var focusSessions: [WorkFocusSession]
    var companies: [WorkCompany]
    var projects: [WorkProject]
    var tasks: [WorkItem]
    /// v1 snapshots written before the native Work collections existed must
    /// not be interpreted as an intentional delete of the server's records.
    /// This marker is local-only and is not encoded into the contract.
    var hasFullProjection: Bool

    init(
        version: Int,
        updatedAt: String,
        activeFocusStartedAt: String?,
        pausedFocusSessionID: String? = nil,
        activeFocusProjectID: String? = nil,
        activeFocusTaskID: String? = nil,
        focusSessions: [WorkFocusSession],
        companies: [WorkCompany] = [],
        projects: [WorkProject] = [],
        tasks: [WorkItem] = [],
        hasFullProjection: Bool = true
    ) {
        self.version = version
        self.updatedAt = updatedAt
        self.activeFocusStartedAt = activeFocusStartedAt
        self.activeFocusProjectID = activeFocusProjectID
        self.activeFocusTaskID = activeFocusTaskID
        self.pausedFocusSessionID = pausedFocusSessionID
        self.focusSessions = focusSessions
        self.companies = companies
        self.projects = projects
        self.tasks = tasks
        self.hasFullProjection = hasFullProjection
    }

    enum CodingKeys: String, CodingKey {
        case version, updatedAt, activeFocusStartedAt, activeFocusProjectID, activeFocusTaskID, pausedFocusSessionID, focusSessions, companies, projects, tasks
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(version, forKey: .version)
        try container.encode(updatedAt, forKey: .updatedAt)
        try container.encodeIfPresent(activeFocusStartedAt, forKey: .activeFocusStartedAt)
        try container.encodeIfPresent(activeFocusProjectID, forKey: .activeFocusProjectID)
        try container.encodeIfPresent(activeFocusTaskID, forKey: .activeFocusTaskID)
        try container.encodeIfPresent(pausedFocusSessionID, forKey: .pausedFocusSessionID)
        try container.encode(focusSessions, forKey: .focusSessions)
        // Keep compact v1 snapshots compact. The local marker is intentionally
        // not encoded; the absence of collection keys is its durable form.
        guard hasFullProjection else { return }
        try container.encode(companies, forKey: .companies)
        try container.encode(projects, forKey: .projects)
        try container.encode(tasks, forKey: .tasks)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? RootineDate.isoTimestamp()
        activeFocusStartedAt = try container.decodeIfPresent(String.self, forKey: .activeFocusStartedAt)
        activeFocusProjectID = try container.decodeIfPresent(String.self, forKey: .activeFocusProjectID)
        activeFocusTaskID = try container.decodeIfPresent(String.self, forKey: .activeFocusTaskID)
        pausedFocusSessionID = try container.decodeIfPresent(String.self, forKey: .pausedFocusSessionID)
        focusSessions = try container.decodeIfPresent([WorkFocusSession].self, forKey: .focusSessions) ?? []
        // v1 native snapshots did not expose these collections. Defaults are
        // intentional: decoding an old local file must never discard the
        // valid focus history it does contain.
        let hasCollections = container.contains(.companies) || container.contains(.projects) || container.contains(.tasks)
        companies = try container.decodeIfPresent([WorkCompany].self, forKey: .companies) ?? []
        projects = try container.decodeIfPresent([WorkProject].self, forKey: .projects) ?? []
        tasks = try container.decodeIfPresent([WorkItem].self, forKey: .tasks) ?? []
        hasFullProjection = hasCollections
    }

    static let empty = WorkWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), activeFocusStartedAt: nil, focusSessions: [])

    var workItems: [WorkItem] {
        get { tasks }
        set { tasks = newValue }
    }
}

/// Normalizes the small Work projection at the persistence boundary. A
/// malformed timestamp or session must not strand the Work screen in an
/// active state, and duplicate IDs must not be allowed to fan out into
/// duplicate canonical records. The last occurrence wins, matching the
/// deterministic merge policy used for backend rows.
func rootineSanitizedWorkWorkspace(_ workspace: WorkWorkspace) -> WorkWorkspace {
    var sanitized = workspace
    if let activeStart = workspace.activeFocusStartedAt,
       RootineDate.date(from: activeStart) == nil
    {
        sanitized.activeFocusStartedAt = nil
    }
    sanitized.pausedFocusSessionID = workspace.pausedFocusSessionID?.rootineTrimmedNonEmpty

    var seenIDs = Set<String>()
    var retained: [WorkFocusSession] = []
    for session in workspace.focusSessions.reversed() {
        let normalizedID = session.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let startedAt = RootineDate.date(from: session.startedAt),
              let endedAt = RootineDate.date(from: session.endedAt) else { continue }
        guard !normalizedID.isEmpty,
              endedAt >= startedAt,
              session.minutes >= 0,
              seenIDs.insert(normalizedID).inserted else { continue }
        var normalized = session
        normalized.id = normalizedID
        // Keep the explicit duration from the contract. Older native rows
        // legitimately used equal placeholder timestamps while still
        // carrying their measured minutes.
        normalized.minutes = max(0, session.minutes)
        normalized.projectId = session.projectId?.rootineTrimmedNonEmpty
        normalized.taskId = session.taskId?.rootineTrimmedNonEmpty
        retained.append(normalized)
    }
    sanitized.focusSessions = Array(retained.reversed())
    if sanitized.activeFocusStartedAt != nil {
        sanitized.pausedFocusSessionID = nil
    } else {
        sanitized.activeFocusProjectID = nil
        sanitized.activeFocusTaskID = nil
    }

    sanitized.companies = rootineDeduplicatedWorkCompanies(workspace.companies)
    let companyIDByNormalized = Dictionary(uniqueKeysWithValues: sanitized.companies.map {
        ($0.id.rootineNormalizedIdentifier, $0.id)
    })
    sanitized.projects = rootineDeduplicatedWorkProjects(workspace.projects).map { project in
        var project = project
        project.companyId = project.companyId.flatMap {
            companyIDByNormalized[$0.rootineNormalizedIdentifier]
        }
        project.startDate = rootineWorkDateKey(project.startDate)
        project.endDate = rootineWorkDateKey(project.endDate)
        if let startDate = project.startDate,
           let endDate = project.endDate,
           endDate < startDate {
            project.endDate = nil
        }
        project.name = project.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return project
    }.filter { !$0.name.isEmpty }
    let projectIDByNormalized = Dictionary(uniqueKeysWithValues: sanitized.projects.map {
        ($0.id.rootineNormalizedIdentifier, $0.id)
    })
    var taskIDs = Set<String>()
    sanitized.tasks = rootineDeduplicatedWorkItems(workspace.tasks).map { task in
        var task = task
        task.title = task.title.trimmingCharacters(in: .whitespacesAndNewlines)
        task.companyId = task.companyId.flatMap {
            companyIDByNormalized[$0.rootineNormalizedIdentifier]
        }
        task.projectId = task.projectId.flatMap {
            projectIDByNormalized[$0.rootineNormalizedIdentifier]
        }
        task.parentId = task.parentId?.rootineTrimmedNonEmpty
        task.startDate = rootineWorkDateKey(task.startDate)
        task.dueDate = rootineWorkDateKey(task.dueDate)
        task.dueTime = rootineWorkClockTime(task.dueTime)
        if task.projectId == nil { task.parentId = nil }
        if task.completed { task.status = .completed }
        if task.status == .completed { task.completed = true }
        guard !task.title.isEmpty else { return nil }
        guard taskIDs.insert(task.id.rootineNormalizedIdentifier).inserted else { return nil }
        return task
    }.compactMap { $0 }
    let validTaskIDs = Set(sanitized.tasks.map { $0.id.rootineNormalizedIdentifier })
    for index in sanitized.tasks.indices {
        guard let parentId = sanitized.tasks[index].parentId,
              validTaskIDs.contains(parentId.rootineNormalizedIdentifier),
              sanitized.tasks[index].projectId?.rootineNormalizedIdentifier == sanitized.tasks.first(where: { $0.id.rootineNormalizedIdentifier == parentId.rootineNormalizedIdentifier })?.projectId?.rootineNormalizedIdentifier,
              let parent = sanitized.tasks.first(where: { $0.id.rootineNormalizedIdentifier == parentId.rootineNormalizedIdentifier }) else {
            sanitized.tasks[index].parentId = nil
            continue
        }
        sanitized.tasks[index].parentId = parent.id
        var ancestors = Set<String>()
        var current = parentId.rootineNormalizedIdentifier
        while let parent = sanitized.tasks.first(where: { $0.id.rootineNormalizedIdentifier == current }),
              let next = parent.parentId?.rootineNormalizedIdentifier {
            guard ancestors.insert(current).inserted, next != sanitized.tasks[index].id.rootineNormalizedIdentifier else {
                sanitized.tasks[index].parentId = nil
                break
            }
            current = next
        }
    }
    // Focus links are relational references in the canonical v3 document.
    // Normalize them against the same winning IDs as the collections and
    // clear only dangling links rather than allowing a rejected row to poison
    // the complete Work snapshot.
    let taskIDByNormalized = Dictionary(uniqueKeysWithValues: sanitized.tasks.map {
        ($0.id.rootineNormalizedIdentifier, $0.id)
    })
    sanitized.activeFocusProjectID = sanitized.activeFocusProjectID.flatMap {
        projectIDByNormalized[$0.rootineNormalizedIdentifier]
    }
    sanitized.activeFocusTaskID = sanitized.activeFocusTaskID.flatMap {
        taskIDByNormalized[$0.rootineNormalizedIdentifier]
    }
    if let taskID = sanitized.activeFocusTaskID,
       let task = sanitized.tasks.first(where: { $0.id == taskID }) {
        sanitized.activeFocusProjectID = task.projectId
    }
    sanitized.focusSessions = sanitized.focusSessions.map { session in
        var session = session
        session.projectId = session.projectId.flatMap {
            projectIDByNormalized[$0.rootineNormalizedIdentifier]
        }
        session.taskId = session.taskId.flatMap {
            taskIDByNormalized[$0.rootineNormalizedIdentifier]
        }
        if let taskID = session.taskId,
           let task = sanitized.tasks.first(where: { $0.id == taskID }) {
            session.projectId = task.projectId
        }
        return session
    }
    if let pausedID = sanitized.pausedFocusSessionID,
       !sanitized.focusSessions.contains(where: { $0.id.rootineNormalizedIdentifier == pausedID.rootineNormalizedIdentifier }) {
        sanitized.pausedFocusSessionID = nil
    }
    return sanitized
}

extension String {
    var rootineTrimmedNonEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    var rootineNormalizedIdentifier: String {
        trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

private func rootineWorkDateKey(_ value: String?) -> String? {
    guard let value = value?.rootineTrimmedNonEmpty else { return nil }
    let parts = value.split(separator: "-").compactMap { Int($0) }
    let calendar = Calendar(identifier: .gregorian)
    let components = DateComponents(year: parts.count > 0 ? parts[0] : nil, month: parts.count > 1 ? parts[1] : nil, day: parts.count > 2 ? parts[2] : nil)
    guard parts.count == 3,
          String(format: "%04d-%02d-%02d", parts[0], parts[1], parts[2]) == value,
          let date = calendar.date(from: components),
          calendar.component(.year, from: date) == parts[0],
          calendar.component(.month, from: date) == parts[1],
          calendar.component(.day, from: date) == parts[2] else {
        return nil
    }
    return value
}

private func rootineWorkClockTime(_ value: String?) -> String? {
    guard let value = value?.rootineTrimmedNonEmpty else { return nil }
    return value.range(of: "^([01]\\d|2[0-3]):[0-5]\\d$", options: .regularExpression) == nil ? nil : value
}

private func rootineDeduplicatedWorkCompanies(_ values: [WorkCompany]) -> [WorkCompany] {
    var seen = Set<String>(); var retained: [WorkCompany] = []
    for value in values.reversed() {
        var value = value; value.id = value.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.id.isEmpty, seen.insert(value.id.rootineNormalizedIdentifier).inserted else { continue }
        value.name = value.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.name.isEmpty else { continue }
        retained.append(value)
    }
    return Array(retained.reversed())
}

private func rootineDeduplicatedWorkProjects(_ values: [WorkProject]) -> [WorkProject] {
    var seen = Set<String>(); var retained: [WorkProject] = []
    for value in values.reversed() {
        var value = value; value.id = value.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.id.isEmpty, seen.insert(value.id.rootineNormalizedIdentifier).inserted else { continue }
        retained.append(value)
    }
    return Array(retained.reversed())
}

private func rootineDeduplicatedWorkItems(_ values: [WorkItem]) -> [WorkItem] {
    var seen = Set<String>(); var retained: [WorkItem] = []
    for value in values.reversed() {
        var value = value; value.id = value.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.id.isEmpty, seen.insert(value.id.rootineNormalizedIdentifier).inserted else { continue }
        retained.append(value)
    }
    return Array(retained.reversed())
}

struct RootineWorkTotals: Equatable, Sendable {
    var projectCount: Int
    var openTaskCount: Int
    var completedTaskCount: Int
    var highPriorityTaskCount: Int
    var focusMinutes: Int
}

func rootineWorkTotals(_ workspace: WorkWorkspace) -> RootineWorkTotals {
    let open = workspace.tasks.filter { !$0.completed && $0.status != .cancelled }
    return RootineWorkTotals(
        projectCount: workspace.projects.filter { $0.status != .archived }.count,
        openTaskCount: open.count,
        completedTaskCount: workspace.tasks.filter { $0.completed || $0.status == .completed }.count,
        highPriorityTaskCount: open.filter { $0.priority == .high || $0.priority == .urgent }.count,
        focusMinutes: rootineFocusTotalMinutes(workspace.focusSessions)
    )
}

func rootineFocusTotalMinutes(_ sessions: [WorkFocusSession], on dateKey: String? = nil) -> Int {
    sessions.filter { session in
        guard let dateKey else { return true }
        guard let startedAt = RootineDate.date(from: session.startedAt) else { return false }
        return RootineDate.localDate(startedAt) == dateKey
    }.reduce(0) { $0 + max(0, $1.minutes) }
}

func rootineFocusHistory(_ sessions: [WorkFocusSession], limit: Int? = nil) -> [WorkFocusSession] {
    let ordered = sessions.sorted {
        if $0.endedAt != $1.endedAt { return $0.endedAt > $1.endedAt }
        return $0.id < $1.id
    }
    guard let limit else { return ordered }
    return Array(ordered.prefix(max(0, limit)))
}

func rootineFocusElapsedSeconds(startedAt: String?, at now: Date) -> Int? {
    guard let startedAt, let start = RootineDate.date(from: startedAt) else { return nil }
    return max(0, Int(now.timeIntervalSince(start)))
}

/// Native travel snapshots intentionally retain the historical v1 envelope
/// (`TravelWorkspace.version == 1`) while the canonical mapping below speaks
/// the web contract's v2 document. This keeps existing on-device files
/// readable during the migration without silently dropping the richer trip
/// dossier.
///
/// Step 13 deliberately does not add maps/geocoding, location tracking,
/// attachments, or background-location behavior. Those capabilities require
/// separate privacy, permissions, and storage contracts.
struct TravelItineraryItem: Codable, Equatable, Identifiable, Sendable {
    var id: String
    /// `day` is the legacy native field. For canonical records it contains an
    /// ISO local date, while old preview records may contain labels such as
    /// "Pt".
    var day: String
    var title: String
    var detail: String
    var date: String
    var time: String
    var location: String
    var kind: String
    var note: String
    var reserved: Bool
    var startsAt: String?
    var endsAt: String?
    var timezone: String?

    init(id: String, day: String, title: String, detail: String) {
        self.id = id
        self.day = day
        self.title = title
        self.detail = detail
        self.date = day
        self.time = ""
        self.location = ""
        self.kind = "activity"
        self.note = detail
        self.reserved = false
        self.startsAt = nil
        self.endsAt = nil
        self.timezone = nil
    }

    init(
        id: String,
        date: String,
        time: String,
        title: String,
        location: String,
        kind: String,
        note: String,
        reserved: Bool,
        startsAt: String? = nil,
        endsAt: String? = nil,
        timezone: String? = nil
    ) {
        self.id = id
        self.day = date
        self.title = title
        self.detail = [location, note].filter { !$0.isEmpty }.joined(separator: " · ")
        self.date = date
        self.time = time
        self.location = location
        self.kind = kind
        self.note = note
        self.reserved = reserved
        self.startsAt = startsAt
        self.endsAt = endsAt
        self.timezone = timezone
    }

    enum CodingKeys: String, CodingKey {
        case id, day, title, detail, date, time, location, kind, note, reserved, startsAt, endsAt, timezone
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        day = try container.decodeIfPresent(String.self, forKey: .day)
            ?? (try container.decodeIfPresent(String.self, forKey: .date))
            ?? ""
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        date = try container.decodeIfPresent(String.self, forKey: .date) ?? day
        time = try container.decodeIfPresent(String.self, forKey: .time) ?? ""
        location = try container.decodeIfPresent(String.self, forKey: .location) ?? ""
        kind = try container.decodeIfPresent(String.self, forKey: .kind) ?? "activity"
        note = try container.decodeIfPresent(String.self, forKey: .note) ?? ""
        reserved = try container.decodeIfPresent(Bool.self, forKey: .reserved) ?? false
        startsAt = try container.decodeIfPresent(String.self, forKey: .startsAt)
        endsAt = try container.decodeIfPresent(String.self, forKey: .endsAt)
        timezone = try container.decodeIfPresent(String.self, forKey: .timezone)
        detail = try container.decodeIfPresent(String.self, forKey: .detail)
            ?? [location, note].filter { !$0.isEmpty }.joined(separator: " · ")
        // Keep legacy convenience fields synchronized after decoding a
        // canonical item. The canonical date is the source of truth.
        if day.isEmpty { day = date }
    }
}

struct TravelStay: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var city: String
    var address: String
    var checkIn: String
    var checkOut: String
    var bookingRef: String
    var status: String
    var amount: Double
    var currency: String?
    var timezone: String?
}

struct TravelTransport: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var mode: String
    var title: String
    var from: String
    var to: String
    var departure: String
    var arrival: String
    var bookingRef: String
    var status: String
    var amount: Double
    var currency: String?
    var timezone: String?
}

/// Relational `trip_bookings` rows are retained separately from the web
/// stay/transport projections. This prevents a normalized booking from being
/// mistaken for accommodation when it has no provider-specific shape.
struct TravelBooking: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var provider: String
    var bookingReference: String
    var status: String
    var amountMinor: Int64?
    var currencyCode: String?
    var startsAt: String?
    var endsAt: String?
    var timezone: String?
}

struct TravelBudgetLine: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var category: String
    var label: String
    var planned: Double
    var actual: Double
    var paid: Bool
    var currency: String?
}

struct TravelDocument: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var owner: String
    var status: String
    var expiresAt: String
    var note: String
    var storagePath: String?
}

struct TravelTask: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var category: String
    var dueDate: String
    var completed: Bool
    var linkedTask: TravelLinkedTask?
}

struct TravelLinkedTask: Codable, Equatable, Sendable {
    var originTaskId: Int
    var view: String
}

struct TravelPackingItem: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var label: String
    var quantity: Int
    var packed: Bool
}

struct TravelRecord: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var destination: String
    var startDate: String
    var endDate: String
    var status: String
    var travelers: [String]
    var baseCurrency: String
    var note: String
    var archivedAt: String?
    var stays: [TravelStay]
    var transports: [TravelTransport]
    var bookings: [TravelBooking]
    var itinerary: [TravelItineraryItem]
    var budget: [TravelBudgetLine]
    var documents: [TravelDocument]
    var tasks: [TravelTask]
    var packingItems: [TravelPackingItem]
    var timezone: String?
    var dateRange: String
    var nights: Int
    var createdAt: String
    var updatedAt: String

    /// Compatibility initializer used by the existing compact iOS screen.
    init(
        id: String,
        destination: String,
        dateRange: String,
        nights: Int,
        itinerary: [TravelItineraryItem],
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.name = destination
        self.destination = destination
        self.startDate = ""
        self.endDate = ""
        self.status = "planning"
        self.travelers = []
        self.baseCurrency = "PLN"
        self.note = ""
        self.archivedAt = nil
        self.stays = []
        self.transports = []
        self.bookings = []
        self.itinerary = itinerary
        self.budget = []
        self.documents = []
        self.tasks = []
        self.packingItems = []
        self.timezone = nil
        self.dateRange = dateRange
        self.nights = max(1, nights)
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(
        id: String,
        name: String,
        destination: String,
        startDate: String,
        endDate: String,
        status: String,
        travelers: [String],
        baseCurrency: String,
        note: String,
        archivedAt: String?,
        stays: [TravelStay],
        transports: [TravelTransport],
        bookings: [TravelBooking] = [],
        itinerary: [TravelItineraryItem],
        budget: [TravelBudgetLine],
        documents: [TravelDocument],
        tasks: [TravelTask],
        packingItems: [TravelPackingItem] = [],
        timezone: String? = nil,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.name = name
        self.destination = destination
        self.startDate = startDate
        self.endDate = endDate
        self.status = status
        self.travelers = travelers
        self.baseCurrency = baseCurrency
        self.note = note
        self.archivedAt = archivedAt
        self.stays = stays
        self.transports = transports
        self.bookings = bookings
        self.itinerary = itinerary
        self.budget = budget
        self.documents = documents
        self.tasks = tasks
        self.packingItems = packingItems
        self.timezone = timezone
        self.dateRange = TravelRecord.makeDateRange(start: startDate, end: endDate)
        self.nights = TravelRecord.makeNights(start: startDate, end: endDate)
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case id, name, destination, startDate, endDate, status, travelers, baseCurrency, note, archivedAt
        case stays, transports, bookings, itinerary, budget, documents, tasks, packingItems, timezone
        case dateRange, nights, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
        destination = try container.decodeIfPresent(String.self, forKey: .destination) ?? name
        startDate = try container.decodeIfPresent(String.self, forKey: .startDate) ?? ""
        endDate = try container.decodeIfPresent(String.self, forKey: .endDate) ?? ""
        dateRange = try container.decodeIfPresent(String.self, forKey: .dateRange)
            ?? TravelRecord.makeDateRange(start: startDate, end: endDate)
        if startDate.isEmpty || endDate.isEmpty {
            let parsed = TravelRecord.parseDateRange(dateRange)
            if startDate.isEmpty { startDate = parsed.start }
            if endDate.isEmpty { endDate = parsed.end }
        }
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "planning"
        travelers = try container.decodeIfPresent([String].self, forKey: .travelers) ?? []
        baseCurrency = try container.decodeIfPresent(String.self, forKey: .baseCurrency) ?? "PLN"
        note = try container.decodeIfPresent(String.self, forKey: .note) ?? ""
        archivedAt = try container.decodeIfPresent(String.self, forKey: .archivedAt)
        stays = try container.decodeIfPresent([TravelStay].self, forKey: .stays) ?? []
        transports = try container.decodeIfPresent([TravelTransport].self, forKey: .transports) ?? []
        bookings = try container.decodeIfPresent([TravelBooking].self, forKey: .bookings) ?? []
        itinerary = try container.decodeIfPresent([TravelItineraryItem].self, forKey: .itinerary) ?? []
        budget = try container.decodeIfPresent([TravelBudgetLine].self, forKey: .budget) ?? []
        documents = try container.decodeIfPresent([TravelDocument].self, forKey: .documents) ?? []
        tasks = try container.decodeIfPresent([TravelTask].self, forKey: .tasks) ?? []
        packingItems = try container.decodeIfPresent([TravelPackingItem].self, forKey: .packingItems) ?? []
        timezone = try container.decodeIfPresent(String.self, forKey: .timezone)
        nights = try container.decodeIfPresent(Int.self, forKey: .nights)
            ?? TravelRecord.makeNights(start: startDate, end: endDate)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? createdAt
        if name.isEmpty { name = destination }
    }

    private static func parseDateRange(_ value: String) -> (start: String, end: String) {
        let pieces = value.components(separatedBy: "–").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard pieces.count == 2,
              RootineDate.isLocalDateKey(pieces[0]),
              RootineDate.isLocalDateKey(pieces[1]) else { return ("", "") }
        return (pieces[0], pieces[1])
    }

    private static func makeDateRange(start: String, end: String) -> String {
        guard !start.isEmpty, !end.isEmpty else { return "" }
        return "\(start) – \(end)"
    }

    private static func makeNights(start: String, end: String) -> Int {
        guard let first = RootineDate.dateOnly(from: start, timezone: "UTC"),
              let last = RootineDate.dateOnly(from: end, timezone: "UTC") else { return 1 }
        return max(1, Calendar(identifier: .gregorian).dateComponents([.day], from: first, to: last).day ?? 1)
    }
}

struct TravelWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var trips: [TravelRecord]

    static let empty = TravelWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), trips: [])
}

enum TravelValidationIssue: Equatable, Sendable {
    case invalidWorkspaceVersion(Int)
    case invalidUpdatedAt
    case missingTripID
    case duplicateTripID(String)
    case missingTripName(String)
    case invalidTripDates(String)
    case invalidTripStatus(String)
    case invalidCurrency(String)
    case invalidTimezone(String)
    case duplicateChildID(tripID: String, collection: String, id: String)
    case missingChildID(tripID: String, collection: String)
    case invalidChildDates(tripID: String, collection: String, id: String)
    case invalidChildDateOrder(tripID: String, collection: String, id: String)
    case invalidChildStatus(tripID: String, collection: String, id: String)
    case invalidClockTime(tripID: String, id: String)
    case invalidAmount(tripID: String, collection: String, id: String)
    case invalidQuantity(tripID: String, id: String)
}

func rootineValidateTravelWorkspace(_ workspace: TravelWorkspace) -> [TravelValidationIssue] {
    var issues: [TravelValidationIssue] = []
    if workspace.version != 1 { issues.append(.invalidWorkspaceVersion(workspace.version)) }
    if RootineDate.date(from: workspace.updatedAt) == nil { issues.append(.invalidUpdatedAt) }
    var tripIDs = Set<String>()

    for trip in workspace.trips {
        let tripID = trip.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !tripID.isEmpty else { issues.append(.missingTripID); continue }
        if !tripIDs.insert(tripID).inserted { issues.append(.duplicateTripID(tripID)) }
        if trip.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { issues.append(.missingTripName(tripID)) }
        let datesAreLegacy = trip.startDate.isEmpty && trip.endDate.isEmpty
        if !datesAreLegacy,
           !(RootineDate.isLocalDateKey(trip.startDate) && RootineDate.isLocalDateKey(trip.endDate) && trip.endDate >= trip.startDate) {
            issues.append(.invalidTripDates(tripID))
        }
        if !["idea", "planning", "ready", "completed"].contains(trip.status) { issues.append(.invalidTripStatus(tripID)) }
        if !rootineIsIsoCurrency(trip.baseCurrency) { issues.append(.invalidCurrency(tripID)) }
        if let timezone = trip.timezone, !RootineDate.isValidTimezone(timezone) { issues.append(.invalidTimezone(tripID)) }

        validateTravelIDs(tripID: tripID, collection: "stays", ids: trip.stays.map(\.id), into: &issues)
        validateTravelIDs(tripID: tripID, collection: "transports", ids: trip.transports.map(\.id), into: &issues)
        validateTravelIDs(tripID: tripID, collection: "bookings", ids: trip.bookings.map(\.id), into: &issues)
        validateTravelIDs(tripID: tripID, collection: "itinerary", ids: trip.itinerary.map(\.id), into: &issues)
        validateTravelIDs(tripID: tripID, collection: "budget", ids: trip.budget.map(\.id), into: &issues)
        validateTravelIDs(tripID: tripID, collection: "documents", ids: trip.documents.map(\.id), into: &issues)
        validateTravelIDs(tripID: tripID, collection: "tasks", ids: trip.tasks.map(\.id), into: &issues)
        validateTravelIDs(tripID: tripID, collection: "packingItems", ids: trip.packingItems.map(\.id), into: &issues)

        for item in trip.itinerary {
            let itemDate = item.date.isEmpty ? item.day : item.date
            if !itemDate.isEmpty && !datesAreLegacy && !rootineTravelDateWithinTrip(itemDate, trip: trip) {
                issues.append(.invalidChildDates(tripID: tripID, collection: "itinerary", id: item.id))
            }
            if !["sightseeing", "food", "transport", "rest", "activity"].contains(item.kind) {
                issues.append(.invalidChildStatus(tripID: tripID, collection: "itinerary", id: item.id))
            }
            if !item.time.isEmpty && !rootineIsClockTime(item.time) { issues.append(.invalidClockTime(tripID: tripID, id: item.id)) }
            if let timezone = item.timezone, !RootineDate.isValidTimezone(timezone) { issues.append(.invalidTimezone(item.id)) }
            if let startsAt = item.startsAt, let endsAt = item.endsAt,
               let start = rootineTravelInstant(startsAt, timezone: item.timezone ?? trip.timezone),
               let end = rootineTravelInstant(endsAt, timezone: item.timezone ?? trip.timezone) {
                if end < start { issues.append(.invalidChildDateOrder(tripID: tripID, collection: "itinerary", id: item.id)) }
            } else if item.startsAt != nil || item.endsAt != nil {
                if (item.startsAt != nil && rootineTravelInstant(item.startsAt!, timezone: item.timezone ?? trip.timezone) == nil)
                    || (item.endsAt != nil && rootineTravelInstant(item.endsAt!, timezone: item.timezone ?? trip.timezone) == nil) {
                    issues.append(.invalidChildDates(tripID: tripID, collection: "itinerary", id: item.id))
                }
            }
        }
        for stay in trip.stays {
            validateTravelAmount(stay.amount, tripID: tripID, collection: "stays", id: stay.id, into: &issues)
            validateTravelRange(stay.checkIn, stay.checkOut, trip: trip, collection: "stays", id: stay.id, timezone: stay.timezone ?? trip.timezone, into: &issues)
            if let currency = stay.currency, !rootineIsIsoCurrency(currency) { issues.append(.invalidCurrency(stay.id)) }
            if !["planned", "booked", "paid"].contains(stay.status) { issues.append(.invalidChildStatus(tripID: tripID, collection: "stays", id: stay.id)) }
        }
        for transport in trip.transports {
            validateTravelAmount(transport.amount, tripID: tripID, collection: "transports", id: transport.id, into: &issues)
            if let currency = transport.currency, !rootineIsIsoCurrency(currency) { issues.append(.invalidCurrency(transport.id)) }
            if !["plane", "train", "car", "bus", "ferry", "other"].contains(transport.mode) { issues.append(.invalidChildStatus(tripID: tripID, collection: "transports", id: transport.id)) }
            if !["planned", "booked", "paid"].contains(transport.status) { issues.append(.invalidChildStatus(tripID: tripID, collection: "transports", id: transport.id)) }
            if transport.departure.isEmpty != transport.arrival.isEmpty {
                issues.append(.invalidChildDateOrder(tripID: tripID, collection: "transports", id: transport.id))
            } else if !transport.departure.isEmpty {
                validateTravelRange(transport.departure, transport.arrival, trip: trip, collection: "transports", id: transport.id, timezone: transport.timezone ?? trip.timezone, into: &issues)
            }
        }
        for booking in trip.bookings {
            if let minor = booking.amountMinor, minor < 0 { issues.append(.invalidAmount(tripID: tripID, collection: "bookings", id: booking.id)) }
            if let timezone = booking.timezone, !RootineDate.isValidTimezone(timezone) { issues.append(.invalidTimezone(booking.id)) }
            if let currency = booking.currencyCode, !rootineIsIsoCurrency(currency) { issues.append(.invalidCurrency(booking.id)) }
            if !["planned", "booked", "paid", "cancelled", "completed"].contains(booking.status) { issues.append(.invalidChildStatus(tripID: tripID, collection: "bookings", id: booking.id)) }
            if let startsAt = booking.startsAt, let endsAt = booking.endsAt {
                validateTravelRange(startsAt, endsAt, trip: trip, collection: "bookings", id: booking.id, timezone: booking.timezone ?? trip.timezone, into: &issues)
            }
        }
        for line in trip.budget {
            validateTravelAmount(line.planned, tripID: tripID, collection: "budget", id: line.id, into: &issues)
            validateTravelAmount(line.actual, tripID: tripID, collection: "budget", id: line.id, into: &issues)
            if let currency = line.currency, !rootineIsIsoCurrency(currency) { issues.append(.invalidCurrency(line.id)) }
            if !["transport", "stay", "food", "attractions", "shopping", "insurance", "other"].contains(line.category) { issues.append(.invalidChildStatus(tripID: tripID, collection: "budget", id: line.id)) }
        }
        for document in trip.documents {
            if !["todo", "pending", "ready"].contains(document.status) { issues.append(.invalidChildStatus(tripID: tripID, collection: "documents", id: document.id)) }
            if !document.expiresAt.isEmpty && !RootineDate.isLocalDateKey(document.expiresAt) { issues.append(.invalidChildDates(tripID: tripID, collection: "documents", id: document.id)) }
        }
        for item in trip.packingItems where item.quantity <= 0 { issues.append(.invalidQuantity(tripID: tripID, id: item.id)) }
        for task in trip.tasks {
            if !task.dueDate.isEmpty && !RootineDate.isLocalDateKey(task.dueDate) { issues.append(.invalidChildDates(tripID: tripID, collection: "tasks", id: task.id)) }
            if !["booking", "documents", "health", "packing", "money", "other"].contains(task.category) { issues.append(.invalidChildStatus(tripID: tripID, collection: "tasks", id: task.id)) }
        }
    }
    return issues
}

private func validateTravelIDs(tripID: String, collection: String, ids: [String], into issues: inout [TravelValidationIssue]) {
    var seen = Set<String>()
    for id in ids {
        let normalized = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { issues.append(.missingChildID(tripID: tripID, collection: collection)); continue }
        if !seen.insert(normalized).inserted { issues.append(.duplicateChildID(tripID: tripID, collection: collection, id: normalized)) }
    }
}

private func validateTravelAmount(_ amount: Double, tripID: String, collection: String, id: String, into issues: inout [TravelValidationIssue]) {
    if !amount.isFinite || amount < 0 { issues.append(.invalidAmount(tripID: tripID, collection: collection, id: id)) }
}

private func validateTravelRange(_ start: String, _ end: String, trip: TravelRecord, collection: String, id: String, timezone: String?, into issues: inout [TravelValidationIssue]) {
    guard let startInstant = rootineTravelInstant(start, timezone: timezone ?? trip.timezone),
          let endInstant = rootineTravelInstant(end, timezone: timezone ?? trip.timezone) else {
        issues.append(.invalidChildDates(tripID: trip.id, collection: collection, id: id)); return
    }
    if endInstant < startInstant { issues.append(.invalidChildDateOrder(tripID: trip.id, collection: collection, id: id)) }
    if !trip.startDate.isEmpty {
        let startDay = RootineDate.localDate(startInstant, timezone: timezone ?? trip.timezone)
        let endDay = RootineDate.localDate(endInstant, timezone: timezone ?? trip.timezone)
        if !rootineTravelDateWithinTrip(startDay, trip: trip) || !rootineTravelDateWithinTrip(endDay, trip: trip) {
            issues.append(.invalidChildDates(tripID: trip.id, collection: collection, id: id))
        }
    }
}

private func rootineTravelDateWithinTrip(_ date: String, trip: TravelRecord) -> Bool {
    RootineDate.isLocalDateKey(date) && (trip.startDate.isEmpty || (date >= trip.startDate && date <= trip.endDate))
}

private func rootineTravelInstant(_ value: String, timezone: String?) -> Date? {
    let zone = timezone ?? "UTC"
    guard RootineDate.isValidTimezone(zone) else { return nil }
    if RootineDate.isLocalDateKey(value) { return RootineDate.dateOnly(from: value, timezone: zone) }
    if let explicit = RootineDate.date(from: value) { return explicit }
    return RootineDate.date(fromLocalDateTime: value, timezone: zone)
}

private func rootineIsClockTime(_ value: String) -> Bool {
    let parts = value.split(separator: ":").compactMap { Int($0) }
    return parts.count == 2 && value.count == 5 && (0...23).contains(parts[0]) && (0...59).contains(parts[1])
}

private func rootineIsIsoCurrency(_ value: String) -> Bool {
    let code = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    return code.count == 3 && code.unicodeScalars.allSatisfy { CharacterSet.uppercaseLetters.contains($0) }
        && Locale.commonISOCurrencyCodes.contains(code)
}

/// A deliberately small, user-entered health signal. The app stores no
/// clinical interpretation and keeps the value bounded to the four options
/// surfaced by the native check-in UI.
struct HealthCheckIn: Codable, Equatable, Identifiable, Sendable {
    var date: String
    var energy: Int
    var note: String?
    var updatedAt: String

    var id: String { date }
}

struct HealthReminder: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var detail: String
    var completedDates: [String]
}

struct HealthWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var checkIns: [String: HealthCheckIn]
    var reminders: [HealthReminder]

    static let empty = HealthWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), checkIns: [:], reminders: [])
}

struct HealthMetrics: Equatable, Sendable {
    let referenceDate: String
    let todayEnergy: Int?
    let checkInCount: Int
    let averageEnergy: Double?
    let reminderCount: Int
    let completedReminderCount: Int
}

/// Validates a local-day key without using the device locale or timezone.
/// This is intentionally stricter than DateFormatter so a malformed key
/// cannot move a check-in to a neighbouring day during sync or recovery.
func rootineHealthLocalDateIsValid(_ value: String) -> Bool {
    let bytes = Array(value.utf8)
    guard bytes.count == 10,
          bytes[4] == 45,
          bytes[7] == 45,
          bytes.enumerated().filter({ $0.offset != 4 && $0.offset != 7 }).allSatisfy({ 48...57 ~= $0.element })
    else { return false }
    let components = value.split(separator: "-").compactMap { Int($0) }
    guard components.count == 3 else { return false }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    guard let date = calendar.date(from: DateComponents(year: components[0], month: components[1], day: components[2])) else { return false }
    let normalized = calendar.dateComponents([.year, .month, .day], from: date)
    return normalized.year == components[0] && normalized.month == components[1] && normalized.day == components[2]
}

private func rootineHealthTrimmed(_ value: String, maxLength: Int) -> String {
    String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLength))
}

func rootineHealthCheckInIsValid(_ checkIn: HealthCheckIn) -> Bool {
    rootineHealthLocalDateIsValid(checkIn.date)
        && (1...4).contains(checkIn.energy)
        && (checkIn.note == nil || checkIn.note!.count <= 500)
        && RootineDate.date(from: checkIn.updatedAt) != nil
}

func rootineHealthReminderIsValid(_ reminder: HealthReminder) -> Bool {
    let id = rootineHealthTrimmed(reminder.id, maxLength: 200)
    let title = rootineHealthTrimmed(reminder.title, maxLength: 200)
    return !id.isEmpty
        && !title.isEmpty
        && reminder.id.trimmingCharacters(in: .whitespacesAndNewlines).count <= 200
        && reminder.title.trimmingCharacters(in: .whitespacesAndNewlines).count <= 200
        && reminder.detail.trimmingCharacters(in: .whitespacesAndNewlines).count <= 1000
        && reminder.completedDates.allSatisfy(rootineHealthLocalDateIsValid)
}

func rootineHealthWorkspaceIsValid(_ workspace: HealthWorkspace) -> Bool {
    guard workspace.version == 1,
          RootineDate.date(from: workspace.updatedAt) != nil,
          workspace.checkIns.allSatisfy({ element in
              element.key == element.value.date && rootineHealthCheckInIsValid(element.value)
          }) else { return false }
    var seenIDs = Set<String>()
    return workspace.reminders.allSatisfy { reminder in
        rootineHealthReminderIsValid(reminder)
            && seenIDs.insert(reminder.id).inserted
    }
}

/// Repairs untrusted local/remote data without inventing a medical value.
/// Invalid check-ins are dropped, while harmless whitespace, duplicate
/// completion days, and duplicate reminder IDs are normalized deterministically
/// (the last record wins, matching the canonical mapping policy).
func rootineSanitizedHealthWorkspace(_ workspace: HealthWorkspace) -> HealthWorkspace {
    var sanitized = workspace
    var checkIns: [String: HealthCheckIn] = [:]
    var sourceKeys: [String: String] = [:]
    // Dictionary iteration order is not part of Swift's data contract. Sort
    // source keys and resolve repaired-date collisions by newest valid
    // updatedAt, then by the stable raw key, so the same payload always
    // produces the same winner on every device.
    for (rawKey, rawCheckIn) in workspace.checkIns.sorted(by: { $0.key < $1.key }) {
        let key = rootineHealthLocalDateIsValid(rawKey) ? rawKey : rawCheckIn.date
        guard rootineHealthLocalDateIsValid(key),
              (1...4).contains(rawCheckIn.energy),
              RootineDate.date(from: rawCheckIn.updatedAt) != nil else { continue }
        var checkIn = rawCheckIn
        checkIn.date = key
        if let note = checkIn.note {
            let normalized = rootineHealthTrimmed(note, maxLength: 500)
            checkIn.note = normalized.isEmpty ? nil : normalized
        }
        guard let existing = checkIns[key], let existingRawKey = sourceKeys[key] else {
            checkIns[key] = checkIn
            sourceKeys[key] = rawKey
            continue
        }
        let incomingDate = RootineDate.date(from: checkIn.updatedAt)!
        let existingDate = RootineDate.date(from: existing.updatedAt)!
        if incomingDate > existingDate ||
            (incomingDate == existingDate && rawKey > existingRawKey) {
            checkIns[key] = checkIn
            sourceKeys[key] = rawKey
        }
    }
    sanitized.checkIns = checkIns

    var seenIDs = Set<String>()
    var reminders: [HealthReminder] = []
    for rawReminder in workspace.reminders.reversed() {
        let id = rootineHealthTrimmed(rawReminder.id, maxLength: 200)
        let title = rootineHealthTrimmed(rawReminder.title, maxLength: 200)
        guard !id.isEmpty, !title.isEmpty, seenIDs.insert(id).inserted else { continue }
        var reminder = rawReminder
        reminder.id = id
        reminder.title = title
        reminder.detail = rootineHealthTrimmed(rawReminder.detail, maxLength: 1000)
        reminder.completedDates = Array(Set(rawReminder.completedDates.filter(rootineHealthLocalDateIsValid))).sorted()
        reminders.append(reminder)
    }
    sanitized.reminders = Array(reminders.reversed())
    if RootineDate.date(from: workspace.updatedAt) == nil {
        sanitized.updatedAt = RootineDate.isoTimestamp()
    }
    return sanitized
}

extension HealthWorkspace {
    /// Returns recent check-ins in stable newest-first order. The dictionary
    /// key is authoritative, which also makes old payloads with a stale
    /// embedded date safe to display and edit.
    func checkInHistory(limit: Int = 30) -> [HealthCheckIn] {
        guard limit > 0 else { return [] }
        let valid = rootineSanitizedHealthWorkspace(self).checkIns.values
        return valid.sorted {
            $0.date > $1.date || ($0.date == $1.date && $0.updatedAt > $1.updatedAt)
        }.prefix(limit).map { $0 }
    }

    func metrics(for referenceDate: String = RootineDate.localDate(), historyDays: Int = 7) -> HealthMetrics {
        let sanitized = rootineSanitizedHealthWorkspace(self)
        let window = max(1, historyDays)
        let history = sanitized.checkInHistory(limit: sanitized.checkIns.count)
        let recent = history.filter { checkIn in
            guard rootineHealthLocalDateIsValid(referenceDate), rootineHealthLocalDateIsValid(checkIn.date) else { return false }
            let start = rootineHealthDateByOffset(referenceDate, days: -(window - 1))
            return checkIn.date >= start && checkIn.date <= referenceDate
        }
        let average = recent.isEmpty ? nil : Double(recent.reduce(0) { $0 + $1.energy }) / Double(recent.count)
        let completed = sanitized.reminders.filter { $0.completedDates.contains(referenceDate) }.count
        return HealthMetrics(
            referenceDate: referenceDate,
            todayEnergy: sanitized.checkIns[referenceDate]?.energy,
            checkInCount: recent.count,
            averageEnergy: average,
            reminderCount: sanitized.reminders.count,
            completedReminderCount: completed
        )
    }
}

private func rootineHealthDateByOffset(_ value: String, days: Int) -> String {
    guard rootineHealthLocalDateIsValid(value) else { return value }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let components = value.split(separator: "-").compactMap { Int($0) }
    guard components.count == 3,
          let date = calendar.date(from: DateComponents(year: components[0], month: components[1], day: components[2])),
          let offset = calendar.date(byAdding: .day, value: days, to: date) else { return value }
    let result = calendar.dateComponents([.year, .month, .day], from: offset)
    return String(format: "%04d-%02d-%02d", result.year ?? 0, result.month ?? 0, result.day ?? 0)
}

// MARK: Pozostałe / Sprawy

enum AffairMatterCategory: String, Codable, CaseIterable, Sendable {
    case urzedy
    case zdrowie
    case dom
    case auto
    case finanse
    case dokumenty

    var label: String {
        switch self {
        case .urzedy: return "Urzędy"
        case .zdrowie: return "Zdrowie"
        case .dom: return "Dom"
        case .auto: return "Auto"
        case .finanse: return "Finanse"
        case .dokumenty: return "Dokumenty"
        }
    }

    static func canonical(_ rawValue: String) -> String {
        let normalized = rawValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        switch normalized {
        case "urzędy", "urzedy", "office", "offices": return Self.urzedy.rawValue
        case "zdrowie", "health": return Self.zdrowie.rawValue
        case "dom": return Self.dom.rawValue
        case "auto", "vehicle", "vehicles": return Self.auto.rawValue
        case "finanse", "finance", "finances": return Self.finanse.rawValue
        case "dokumenty", "document", "documents": return Self.dokumenty.rawValue
        default: return Self.dom.rawValue
        }
    }
}

/// The iOS projection intentionally mirrors the web Affairs v2 contract so
/// the native module can edit real records without creating a second schema.
/// Fields that are not yet surfaced in the compact editor are still retained
/// during Codable round-trips.
struct AffairMatter: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var category: String
    var priority: String
    var status: String
    var dueDate: String
    var note: String
    var createdAt: String
    var kind: String? = nil
    var time: String? = nil
    var location: String? = nil
    var reminderMinutes: [Int]? = nil
    var sourceAttentionKey: String? = nil
}

struct AffairOneTimePayment: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var category: String
    var amount: Double
    var dueDate: String
    var paid: Bool
    var paidAt: String
    var note: String
}

struct AffairRecurringPayment: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var category: String
    var amount: Double
    var cadence: String
    var nextDueDate: String
    var automatic: Bool
    var active: Bool
    var note: String
}

struct AffairSubscription: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var category: String
    var amount: Double
    var cadence: String
    var nextBillingDate: String
    var renewal: String
    var commitmentEndDate: String
    var active: Bool
    var note: String
}

struct AffairDocument: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var category: String
    var holder: String
    var expiresAt: String
    var reminderDays: Int
    var note: String
}

struct AffairVehicle: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var registration: String
    var mileage: Double
}

struct AffairVehicleItem: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var vehicleId: String
    var title: String
    var type: String
    var dueDate: String
    var dueMileage: Double?
    var done: Bool
    var note: String
}

struct AffairBudgetLine: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var label: String
    var kind: String
    var planned: Double
    var actual: Double
}

struct AffairBudgetMonth: Codable, Equatable, Identifiable, Sendable {
    var month: String
    var lines: [AffairBudgetLine]
    var id: String { month }
}

struct AffairAttentionState: Codable, Equatable, Identifiable, Sendable {
    var key: String
    var status: String
    var snoozedUntil: String
    var updatedAt: String
    var id: String { key }
}

struct AffairsWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var matters: [AffairMatter]
    var oneTimePayments: [AffairOneTimePayment]
    var payments: [AffairRecurringPayment]
    var subscriptions: [AffairSubscription]
    var documents: [AffairDocument]
    var vehicles: [AffairVehicle]
    var vehicleItems: [AffairVehicleItem]
    var budgets: [AffairBudgetMonth]
    var attentionStates: [AffairAttentionState]?

    init(
        version: Int,
        matters: [AffairMatter],
        oneTimePayments: [AffairOneTimePayment],
        payments: [AffairRecurringPayment],
        subscriptions: [AffairSubscription],
        documents: [AffairDocument],
        vehicles: [AffairVehicle],
        vehicleItems: [AffairVehicleItem],
        budgets: [AffairBudgetMonth],
        attentionStates: [AffairAttentionState]? = nil
    ) {
        self.version = version
        self.matters = matters
        self.oneTimePayments = oneTimePayments
        self.payments = payments
        self.subscriptions = subscriptions
        self.documents = documents
        self.vehicles = vehicles
        self.vehicleItems = vehicleItems
        self.budgets = budgets
        self.attentionStates = attentionStates
    }

    static let empty = AffairsWorkspace(
        version: 2,
        matters: [],
        oneTimePayments: [],
        payments: [],
        subscriptions: [],
        documents: [],
        vehicles: [],
        vehicleItems: [],
        budgets: [],
        attentionStates: []
    )

    // v1 archives only carried matters, recurring payments and budgets. Keep
    // decoding permissive at this boundary so AppEnvironment can validate the
    // declared version and perform the explicit v1 -> v2 migration before
    // publishing the snapshot.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        matters = try container.decodeIfPresent([AffairMatter].self, forKey: .matters) ?? []
        oneTimePayments = try container.decodeIfPresent([AffairOneTimePayment].self, forKey: .oneTimePayments) ?? []
        payments = try container.decodeIfPresent([AffairRecurringPayment].self, forKey: .payments) ?? []
        subscriptions = try container.decodeIfPresent([AffairSubscription].self, forKey: .subscriptions) ?? []
        documents = try container.decodeIfPresent([AffairDocument].self, forKey: .documents) ?? []
        vehicles = try container.decodeIfPresent([AffairVehicle].self, forKey: .vehicles) ?? []
        vehicleItems = try container.decodeIfPresent([AffairVehicleItem].self, forKey: .vehicleItems) ?? []
        budgets = try container.decodeIfPresent([AffairBudgetMonth].self, forKey: .budgets) ?? []
        attentionStates = try container.decodeIfPresent([AffairAttentionState].self, forKey: .attentionStates)
    }
}

struct RootineWorkspaceExport: Codable, Equatable, Sendable {
    static let currentVersion = 1

    var schemaVersion: Int
    var exportedAt: String
    var accountID: String?
    var accountEmail: String?
    var tasks: TaskWorkspace
    var nutrition: NutritionWorkspace
    var notes: NotesWorkspace
    var sport: SportWorkspace
    var goals: GoalsWorkspace
    var work: WorkWorkspace
    var travel: TravelWorkspace
    var health: HealthWorkspace
    var affairs: AffairsWorkspace
}

struct NutritionProduct: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var barcode: String
    var name: String
    var brand: String? = nil
    var source: String
    var defaultAmount: Double
    var unit: String
    var packageLabel: String? = nil
    var per100g: NutritionValues
}

struct NutritionProductCache: Codable, Equatable, Sendable {
    var products: [NutritionProduct]

    static let empty = NutritionProductCache(products: [])
}

enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}

enum RootineDate {
    private static let utc = TimeZone(secondsFromGMT: 0) ?? .current

    static func isoTimestamp(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func date(from timestamp: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: timestamp) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: timestamp)
    }

    static func localDate(_ date: Date = Date(), calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func localDate(_ date: Date, timeZone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return localDate(date, calendar: calendar)
    }

    static func localDate(_ date: Date, timezone: String?) -> String {
        guard let timezone, let zone = TimeZone(identifier: timezone) else { return localDate(date) }
        return localDate(date, timeZone: zone)
    }

    static func dateOnly(from value: String, timezone: String = "UTC") -> Date? {
        guard isValidLocalDate(value), let zone = TimeZone(identifier: timezone) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)) else { return nil }
        let normalized = calendar.dateComponents([.year, .month, .day], from: date)
        guard normalized.year == parts[0], normalized.month == parts[1], normalized.day == parts[2] else { return nil }
        return date
    }

    static func date(fromLocalDateTime value: String, timezone: String) -> Date? {
        guard let zone = TimeZone(identifier: timezone), value.count == 16,
              value[value.index(value.startIndex, offsetBy: 10)] == "T",
              value[value.index(value.startIndex, offsetBy: 13)] == ":" else { return nil }
        let datePart = String(value.prefix(10))
        let hour = Int(value.dropFirst(11).prefix(2))
        let minute = Int(value.dropFirst(14).prefix(2))
        guard isValidLocalDate(datePart), let hour, let minute,
              (0...23).contains(hour), (0...59).contains(minute),
              let parts = dateParts(datePart) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        guard let date = calendar.date(from: DateComponents(year: parts.year, month: parts.month, day: parts.day, hour: hour, minute: minute)) else { return nil }
        let normalized = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        guard normalized.year == parts.year, normalized.month == parts.month,
              normalized.day == parts.day, normalized.hour == hour, normalized.minute == minute else { return nil }
        return date
    }

    static func isLocalDateKey(_ value: String) -> Bool { isValidLocalDate(value) }

    static func shiftLocalDateKey(_ value: String, by days: Int) -> String? {
        guard isValidLocalDate(value) else { return nil }
        return shiftLocalDate(value, by: days)
    }

    static func calendarDaysBetween(_ start: String, _ end: String) -> Int? {
        daysBetween(start, end)
    }

    static func isClockTime(_ value: String) -> Bool {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 && value.count == 5
            && (0...23).contains(parts[0]) && (0...59).contains(parts[1])
    }

    static func isValidTimezone(_ value: String) -> Bool {
        TimeZone(identifier: value) != nil
    }

    /// Strictly validates a canonical date-only value. Date-only fields are
    /// intentionally never parsed through an ISO timestamp because that would
    /// apply the device timezone before the calendar day is known.
    static func isValidLocalDate(_ value: String) -> Bool {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false).compactMap { Int($0) }
        guard parts.count == 3, value.count == 10,
              parts[0] >= 1, parts[1] >= 1, parts[1] <= 12, parts[2] >= 1 else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        guard let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)) else { return false }
        return localDate(date, calendar: calendar) == value
    }

    /// Parses a date-only contract value at noon in the supplied calendar.
    /// Noon avoids the small set of historical midnight timezone transitions
    /// and keeps day arithmetic stable around DST boundaries.
    static func localDateValue(_ value: String, calendar: Calendar = .current) -> Date? {
        guard isValidLocalDate(value) else { return nil }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        components.hour = 12
        return calendar.date(from: components)
    }

    static func shiftLocalDate(_ value: String, by days: Int, calendar: Calendar = .current) -> String {
        guard let date = localDateValue(value, calendar: calendar),
              let shifted = calendar.date(byAdding: .day, value: days, to: date) else { return value }
        return localDate(shifted, calendar: calendar)
    }

    static func daysBetween(_ start: String, _ end: String) -> Int? {
        guard isValidLocalDate(start), isValidLocalDate(end) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        guard let startDate = localDateValue(start, calendar: calendar),
              let endDate = localDateValue(end, calendar: calendar) else { return nil }
        return calendar.dateComponents([.day], from: startDate, to: endDate).day
    }

    /// Resolves a wall-clock value to an instant in the saved timezone. A
    /// spring-forward gap is moved to its first valid wall-clock instant; an
    /// autumn overlap chooses the earlier instant. Both choices are explicit,
    /// making reminder and calendar tests deterministic across devices.
    static func instant(
        localDate date: String,
        time: String,
        timeZone: TimeZone
    ) -> Date? {
        guard isValidLocalDate(date),
              let timeParts = clockTimeParts(time),
              let desired = wallClockDate(yearMonthDay: dateParts(date), hour: timeParts.hour, minute: timeParts.minute) else { return nil }
        let zone = timeZone
        let desiredEpoch = desired.timeIntervalSince1970
        let offsets = Set([-86_400.0, 0, 86_400.0].compactMap { delta -> TimeInterval? in
            let probe = Date(timeIntervalSince1970: desiredEpoch + delta)
            guard let wall = wallClockDate(in: probe, timeZone: zone) else { return nil }
            return wall.timeIntervalSince1970 - (desiredEpoch + delta)
        })
        let candidates = offsets.map { desiredEpoch - $0 }.sorted()
        if let exact = candidates.first(where: { candidate in
            wallClockDate(in: Date(timeIntervalSince1970: candidate), timeZone: zone)?.timeIntervalSince1970 == desiredEpoch
        }) {
            return Date(timeIntervalSince1970: exact)
        }
        if let afterGap = candidates
            .compactMap({ candidate -> (Double, Double)? in
                guard let wall = wallClockDate(in: Date(timeIntervalSince1970: candidate), timeZone: zone) else { return nil }
                return (candidate, wall.timeIntervalSince1970)
            })
            .filter({ $0.1 > desiredEpoch })
            .sorted(by: { $0.1 < $1.1 })
            .first {
            return Date(timeIntervalSince1970: afterGap.0)
        }
        return candidates.first.map { Date(timeIntervalSince1970: $0) }
    }

    private static func dateParts(_ value: String) -> (year: Int, month: Int, day: Int)? {
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return (parts[0], parts[1], parts[2])
    }

    private static func clockTimeParts(_ value: String) -> (hour: Int, minute: Int)? {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, value.count == 5,
              parts[0] >= 0, parts[0] <= 23, parts[1] >= 0, parts[1] <= 59 else { return nil }
        return (parts[0], parts[1])
    }

    private static func wallClockDate(
        yearMonthDay: (year: Int, month: Int, day: Int)?,
        hour: Int,
        minute: Int
    ) -> Date? {
        guard let yearMonthDay else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar.date(from: DateComponents(
            year: yearMonthDay.year,
            month: yearMonthDay.month,
            day: yearMonthDay.day,
            hour: hour,
            minute: minute
        ))
    }

    private static func wallClockDate(in instant: Date, timeZone: TimeZone) -> Date? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: instant)
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = utc
        return utcCalendar.date(from: components)
    }
}

// MARK: Affairs domain rules

/// Money from the web contract is transported as a JSON number for backwards
/// compatibility. Keep arithmetic decimal-safe and round only at this native
/// boundary so budgets and recurring summaries do not accumulate float noise.
enum AffairMoney {
    static let fractionDigits = 2

    static func decimal(_ amount: Double) -> Decimal? {
        guard amount.isFinite, amount >= 0 else { return nil }
        return Decimal(string: String(format: "%.15g", amount), locale: Locale(identifier: "en_US_POSIX"))
    }

    static func parse(_ value: String) -> Decimal? {
        var normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\u{00a0}", with: "")
        if normalized.contains(",") {
            normalized = normalized.replacingOccurrences(of: ".", with: "")
                .replacingOccurrences(of: ",", with: ".")
        }
        guard !normalized.isEmpty,
              let amount = Decimal(string: normalized, locale: Locale(identifier: "en_US_POSIX")),
              amount >= 0 else { return nil }
        return rounded(amount)
    }

    static func rounded(_ amount: Decimal) -> Decimal {
        var source = amount
        var result = Decimal()
        NSDecimalRound(&result, &source, fractionDigits, .bankers)
        return result
    }

    static func normalized(_ amount: Double) -> Double {
        guard let value = decimal(amount) else { return 0 }
        return NSDecimalNumber(decimal: rounded(value)).doubleValue
    }

    static func adding(_ values: some Sequence<Double>) -> Double {
        var total = Decimal.zero
        for value in values {
            guard let decimal = decimal(value) else { continue }
            total += decimal
        }
        return NSDecimalNumber(decimal: rounded(total)).doubleValue
    }

    static func monthlyEquivalent(amount: Double, cadence: String) -> Double {
        let divisor: Decimal = cadence == "quarterly" ? 3 : cadence == "yearly" ? 12 : 1
        guard let value = decimal(amount) else { return 0 }
        return NSDecimalNumber(decimal: rounded(value / divisor)).doubleValue
    }

    static func formatted(_ amount: Double, currency: String = "PLN") -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "pl-PL")
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.minimumFractionDigits = fractionDigits
        formatter.maximumFractionDigits = fractionDigits
        return formatter.string(from: NSNumber(value: normalized(amount))) ?? "\(normalized(amount)) \(currency)"
    }
}

enum AffairDate {
    private static let datePattern = #"^\d{4}-\d{2}-\d{2}$"#
    private static let utc = TimeZone(secondsFromGMT: 0) ?? .current

    static func isValid(_ value: String, allowingEmpty: Bool = true) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return allowingEmpty }
        guard trimmed.range(of: datePattern, options: .regularExpression) != nil else { return false }
        return date(from: trimmed) != nil
    }

    static func monthIsValid(_ value: String) -> Bool {
        guard value.range(of: #"^\d{4}-\d{2}$"#, options: .regularExpression) != nil else { return false }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        return parts.count == 2 && (1...12).contains(parts[1])
    }

    static func date(from value: String) -> Date? {
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, parts[0] > 0 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        guard let result = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        let check = calendar.dateComponents([.year, .month, .day], from: result)
        return check.year == parts[0] && check.month == parts[1] && check.day == parts[2] ? result : nil
    }

    static func key(from date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }

    static func advance(_ value: String, cadence: String) -> String {
        guard let date = date(from: value) else { return value }
        let months = cadence == "quarterly" ? 3 : cadence == "yearly" ? 12 : 1
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return key(from: calendar.date(byAdding: .month, value: months, to: date) ?? date)
    }

    static func advanceToFuture(_ value: String, cadence: String, reference: Date = Date()) -> String {
        var next = value
        let today = key(from: reference)
        for _ in 0..<240 where !next.isEmpty && next <= today {
            let advanced = advance(next, cadence: cadence)
            if advanced == next { break }
            next = advanced
        }
        return next
    }

    static func days(from start: String, to end: String) -> Int? {
        guard let startDate = date(from: start), let endDate = date(from: end) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar.dateComponents([.day], from: startDate, to: endDate).day
    }
}

enum AffairsValidationIssue: Equatable, Sendable {
    case duplicateID(collection: String, id: String)
    case missingID(collection: String)
    case emptyTitle(collection: String, id: String)
    case invalidDate(collection: String, id: String, field: String)
    case invalidAmount(collection: String, id: String)
    case invalidCadence(collection: String, id: String)
    case invalidReference(collection: String, id: String, field: String)
}

enum AffairsWorkspaceRules {
    static let cadences = Set(["monthly", "quarterly", "yearly"])
    static let categories = Set(AffairMatterCategory.allCases.map(\.rawValue))
    static let documentCategories = Set(["identity", "driving", "insurance", "health", "agreement", "other"])
    static let vehicleItemTypes = Set(["insurance", "inspection", "service", "tires", "lease", "warranty", "other"])
    static let budgetKinds = Set(["income", "fixed", "flexible", "savings"])

    static func validate(_ workspace: AffairsWorkspace) -> [AffairsValidationIssue] {
        var issues: [AffairsValidationIssue] = []
        func ids<T>(_ values: [T], collection: String, id: (T) -> String) {
            var seen = Set<String>()
            for value in values {
                let valueID = id(value)
                if valueID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    issues.append(.missingID(collection: collection))
                } else if !seen.insert(valueID).inserted {
                    issues.append(.duplicateID(collection: collection, id: valueID))
                }
            }
        }
        ids(workspace.matters, collection: "matters", id: \.id)
        ids(workspace.oneTimePayments, collection: "oneTimePayments", id: \.id)
        ids(workspace.payments, collection: "payments", id: \.id)
        ids(workspace.subscriptions, collection: "subscriptions", id: \.id)
        ids(workspace.documents, collection: "documents", id: \.id)
        ids(workspace.vehicles, collection: "vehicles", id: \.id)
        ids(workspace.vehicleItems, collection: "vehicleItems", id: \.id)
        ids(workspace.budgets, collection: "budgets", id: \.month)
        for matter in workspace.matters {
            if matter.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { issues.append(.emptyTitle(collection: "matters", id: matter.id)) }
            if !categories.contains(matter.category) { issues.append(.invalidReference(collection: "matters", id: matter.id, field: "category")) }
            if !AffairDate.isValid(matter.dueDate) { issues.append(.invalidDate(collection: "matters", id: matter.id, field: "dueDate")) }
        }
        for payment in workspace.oneTimePayments {
            if payment.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { issues.append(.emptyTitle(collection: "oneTimePayments", id: payment.id)) }
            if payment.amount.isNaN || payment.amount.isInfinite || payment.amount < 0 { issues.append(.invalidAmount(collection: "oneTimePayments", id: payment.id)) }
            if !AffairDate.isValid(payment.dueDate, allowingEmpty: false) { issues.append(.invalidDate(collection: "oneTimePayments", id: payment.id, field: "dueDate")) }
        }
        for payment in workspace.payments {
            if payment.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { issues.append(.emptyTitle(collection: "payments", id: payment.id)) }
            if payment.amount.isNaN || payment.amount.isInfinite || payment.amount < 0 { issues.append(.invalidAmount(collection: "payments", id: payment.id)) }
            if !cadences.contains(payment.cadence) { issues.append(.invalidCadence(collection: "payments", id: payment.id)) }
            if !AffairDate.isValid(payment.nextDueDate, allowingEmpty: false) { issues.append(.invalidDate(collection: "payments", id: payment.id, field: "nextDueDate")) }
        }
        for subscription in workspace.subscriptions {
            if subscription.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { issues.append(.emptyTitle(collection: "subscriptions", id: subscription.id)) }
            if subscription.amount.isNaN || subscription.amount.isInfinite || subscription.amount < 0 { issues.append(.invalidAmount(collection: "subscriptions", id: subscription.id)) }
            if !cadences.contains(subscription.cadence) { issues.append(.invalidCadence(collection: "subscriptions", id: subscription.id)) }
            if !AffairDate.isValid(subscription.nextBillingDate, allowingEmpty: false) { issues.append(.invalidDate(collection: "subscriptions", id: subscription.id, field: "nextBillingDate")) }
            if !AffairDate.isValid(subscription.commitmentEndDate) { issues.append(.invalidDate(collection: "subscriptions", id: subscription.id, field: "commitmentEndDate")) }
        }
        for document in workspace.documents {
            if document.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { issues.append(.emptyTitle(collection: "documents", id: document.id)) }
            if !documentCategories.contains(document.category) { issues.append(.invalidReference(collection: "documents", id: document.id, field: "category")) }
            if !AffairDate.isValid(document.expiresAt) { issues.append(.invalidDate(collection: "documents", id: document.id, field: "expiresAt")) }
            if !(0...730).contains(document.reminderDays) { issues.append(.invalidReference(collection: "documents", id: document.id, field: "reminderDays")) }
        }
        let vehicleIDs = Set(workspace.vehicles.map(\.id))
        for item in workspace.vehicleItems {
            if item.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { issues.append(.emptyTitle(collection: "vehicleItems", id: item.id)) }
            if !vehicleIDs.contains(item.vehicleId) { issues.append(.invalidReference(collection: "vehicleItems", id: item.id, field: "vehicleId")) }
            if !vehicleItemTypes.contains(item.type) { issues.append(.invalidReference(collection: "vehicleItems", id: item.id, field: "type")) }
            if !AffairDate.isValid(item.dueDate) { issues.append(.invalidDate(collection: "vehicleItems", id: item.id, field: "dueDate")) }
        }
        for budget in workspace.budgets {
            if !AffairDate.monthIsValid(budget.month) { issues.append(.invalidDate(collection: "budgets", id: budget.month, field: "month")) }
            ids(budget.lines, collection: "budget.lines", id: \.id)
            for line in budget.lines where !budgetKinds.contains(line.kind) { issues.append(.invalidReference(collection: "budget.lines", id: line.id, field: "kind")) }
            for line in budget.lines where line.planned < 0 || line.actual < 0 || !line.planned.isFinite || !line.actual.isFinite { issues.append(.invalidAmount(collection: "budget.lines", id: line.id)) }
        }
        return issues
    }

    static func normalized(_ workspace: AffairsWorkspace) -> AffairsWorkspace {
        var result = workspace
        result.version = 2
        result.matters = workspace.matters.map { matter in
            var item = matter
            item.title = matter.title.trimmingCharacters(in: .whitespacesAndNewlines)
            item.category = AffairMatterCategory.canonical(matter.category)
            item.priority = matter.priority == "high" ? "high" : "normal"
            item.status = ["open", "waiting", "done"].contains(matter.status) ? matter.status : "open"
            item.dueDate = matter.dueDate.trimmingCharacters(in: .whitespacesAndNewlines)
            item.note = matter.note.trimmingCharacters(in: .whitespacesAndNewlines)
            if let reminders = matter.reminderMinutes { item.reminderMinutes = Array(Set(reminders.filter { $0 >= 0 })).sorted() }
            return item
        }
        result.oneTimePayments = workspace.oneTimePayments.map { payment in
            var item = payment
            item.amount = AffairMoney.normalized(max(0, payment.amount))
            item.title = payment.title.trimmingCharacters(in: .whitespacesAndNewlines)
            item.category = payment.category.trimmingCharacters(in: .whitespacesAndNewlines)
            item.dueDate = payment.dueDate.trimmingCharacters(in: .whitespacesAndNewlines)
            item.note = payment.note.trimmingCharacters(in: .whitespacesAndNewlines)
            return item
        }
        result.payments = workspace.payments.map { payment in
            var item = payment
            item.amount = AffairMoney.normalized(max(0, payment.amount))
            item.name = payment.name.trimmingCharacters(in: .whitespacesAndNewlines)
            item.cadence = cadences.contains(payment.cadence) ? payment.cadence : "monthly"
            item.nextDueDate = payment.nextDueDate.trimmingCharacters(in: .whitespacesAndNewlines)
            item.note = payment.note.trimmingCharacters(in: .whitespacesAndNewlines)
            return item
        }
        result.subscriptions = workspace.subscriptions.map { subscription in
            var item = subscription
            item.amount = AffairMoney.normalized(max(0, subscription.amount))
            item.name = subscription.name.trimmingCharacters(in: .whitespacesAndNewlines)
            item.cadence = cadences.contains(subscription.cadence) ? subscription.cadence : "monthly"
            item.renewal = ["automatic", "manual"].contains(subscription.renewal) ? subscription.renewal : "manual"
            item.nextBillingDate = subscription.nextBillingDate.trimmingCharacters(in: .whitespacesAndNewlines)
            item.commitmentEndDate = subscription.commitmentEndDate.trimmingCharacters(in: .whitespacesAndNewlines)
            item.note = subscription.note.trimmingCharacters(in: .whitespacesAndNewlines)
            return item
        }
        result.documents = workspace.documents.map { document in
            var item = document
            item.name = document.name.trimmingCharacters(in: .whitespacesAndNewlines)
            item.category = documentCategories.contains(document.category) ? document.category : "other"
            item.holder = document.holder.trimmingCharacters(in: .whitespacesAndNewlines)
            item.expiresAt = document.expiresAt.trimmingCharacters(in: .whitespacesAndNewlines)
            item.reminderDays = min(730, max(0, document.reminderDays))
            item.note = document.note.trimmingCharacters(in: .whitespacesAndNewlines)
            return item
        }
        result.vehicles = workspace.vehicles.map { vehicle in
            var item = vehicle
            item.name = vehicle.name.trimmingCharacters(in: .whitespacesAndNewlines)
            item.registration = vehicle.registration.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(with: Locale(identifier: "pl-PL"))
            item.mileage = AffairMoney.normalized(max(0, vehicle.mileage))
            return item
        }
        result.vehicleItems = workspace.vehicleItems.map { vehicleItem in
            var item = vehicleItem
            item.vehicleId = vehicleItem.vehicleId.trimmingCharacters(in: .whitespacesAndNewlines)
            item.title = vehicleItem.title.trimmingCharacters(in: .whitespacesAndNewlines)
            item.type = vehicleItemTypes.contains(vehicleItem.type) ? vehicleItem.type : "other"
            item.dueDate = vehicleItem.dueDate.trimmingCharacters(in: .whitespacesAndNewlines)
            if let dueMileage = vehicleItem.dueMileage { item.dueMileage = AffairMoney.normalized(max(0, dueMileage)) }
            item.note = vehicleItem.note.trimmingCharacters(in: .whitespacesAndNewlines)
            return item
        }
        result.budgets = workspace.budgets.map { month in
            AffairBudgetMonth(month: month.month.trimmingCharacters(in: .whitespacesAndNewlines), lines: month.lines.map { line in
                var item = line
                item.label = line.label.trimmingCharacters(in: .whitespacesAndNewlines)
                item.kind = budgetKinds.contains(line.kind) ? line.kind : "flexible"
                item.planned = AffairMoney.normalized(max(0, line.planned))
                item.actual = AffairMoney.normalized(max(0, line.actual))
                return item
            })
        }
        result.attentionStates = workspace.attentionStates?.map { state in
            var item = state
            item.key = state.key.trimmingCharacters(in: .whitespacesAndNewlines)
            item.status = ["snoozed", "resolved"].contains(state.status) ? state.status : "resolved"
            item.snoozedUntil = state.snoozedUntil.trimmingCharacters(in: .whitespacesAndNewlines)
            return item
        }
        return result
    }
}

func affairAdvancePaymentDate(_ value: String, cadence: String) -> String {
    AffairDate.advance(value, cadence: cadence)
}

func affairAdvancePaymentDateToFuture(_ value: String, cadence: String, reference: Date = Date()) -> String {
    AffairDate.advanceToFuture(value, cadence: cadence, reference: reference)
}

func affairMonthlyEquivalent(_ amount: Double, cadence: String) -> Double {
    AffairMoney.monthlyEquivalent(amount: amount, cadence: cadence)
}
