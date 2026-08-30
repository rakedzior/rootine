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
    // Private local copies of the last full canonical payload. They are never
    // uploaded; they let compact native projections update one record without
    // deleting web-only fields.
    case sportCanonicalShadow = "rootine.canonical-shadow.sport.v1"
    case goalsCanonicalShadow = "rootine.canonical-shadow.goals.v1"
    case workCanonicalShadow = "rootine.canonical-shadow.work.v1"
    case travelCanonicalShadow = "rootine.canonical-shadow.travel.v1"
    case healthCanonicalShadow = "rootine.canonical-shadow.health.v1"
}

enum TaskPriority: String, Codable, CaseIterable, Sendable {
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

struct WorkspaceHabitSchedule: Codable, Equatable, Sendable {
    var type: String
    var weekdays: [Int]? = nil
    var interval: Int? = nil
    var startDate: String
    var endDate: String? = nil
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
        let days = calendar.dateComponents([.day], from: startWeek, to: currentWeek).day ?? 0
        return days >= 0 && (days / 7) % max(1, schedule.interval ?? 1) == 0
    case "interval":
        guard let date = rootineHabitDate(from: dateKey, calendar: calendar),
              let start = rootineHabitDate(from: schedule.startDate, calendar: calendar) else { return true }
        let days = calendar.dateComponents([.day], from: start, to: date).day ?? -1
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
        guard let date = rootineHabitDate(from: referenceDate, calendar: calendar),
              let current = calendar.date(byAdding: .day, value: -offset, to: date) else { break }
        let dateKey = RootineDate.localDate(current, calendar: calendar)
        if let startDate = habit.schedule?.startDate, dateKey < startDate { break }
        if rootineHabitIsPausedOnDate(habit, dateKey: dateKey) { continue }
        if !rootineHabitIsScheduledOnDate(habit, dateKey: dateKey, calendar: calendar) { continue }
        if !rootineHabitIsDoneOnDate(habit, dateKey: dateKey) { break }
        streak += 1
    }
    return streak
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
}

struct NutritionValues: Codable, Equatable, Sendable {
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
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

    static let empty = NutritionWorkspace(
        version: 6,
        updatedAt: RootineDate.isoTimestamp(),
        goals: NutritionGoals(calories: 2300, protein: 150, carbs: 270, fat: 75, waterMl: 2000),
        macroConfiguration: MacroConfiguration(mode: "grams", preset: "balanced", proteinPercent: 25, carbsPercent: 45, fatPercent: 30),
        weightMeasurements: [:],
        bodyMeasurements: [:],
        customMeals: [],
        days: [:]
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
}

struct SportWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var workouts: [SportWorkout]

    static let empty = SportWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), workouts: [])
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

    var progress: Double {
        guard target > 0 else { return 0 }
        return min(1, max(0, current / target))
    }
}

struct GoalsWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var goals: [GoalRecord]

    static let empty = GoalsWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), goals: [])
}

struct WorkFocusSession: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var startedAt: String
    var endedAt: String
    var minutes: Int
}

struct WorkWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var activeFocusStartedAt: String?
    var focusSessions: [WorkFocusSession]

    static let empty = WorkWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), activeFocusStartedAt: nil, focusSessions: [])
}

struct TravelItineraryItem: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var day: String
    var title: String
    var detail: String
}

struct TravelRecord: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var destination: String
    var dateRange: String
    var nights: Int
    var itinerary: [TravelItineraryItem]
    var createdAt: String
    var updatedAt: String
}

struct TravelWorkspace: Codable, Equatable, Sendable {
    var version: Int
    var updatedAt: String
    var trips: [TravelRecord]

    static let empty = TravelWorkspace(version: 1, updatedAt: RootineDate.isoTimestamp(), trips: [])
}

struct HealthCheckIn: Codable, Equatable, Sendable {
    var date: String
    var energy: Int
    var note: String?
    var updatedAt: String
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
    static func isoTimestamp(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func localDate(_ date: Date = Date(), calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
