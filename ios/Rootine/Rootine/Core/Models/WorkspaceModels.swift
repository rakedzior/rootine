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
             .travelCanonicalShadow, .healthCanonicalShadow:
            return nil
        case .normalizedReadState:
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

/// Returns the completion state for the requested local day. Recurring tasks
/// carry an explicit per-day completion map; one-off tasks keep their legacy
/// global `done` flag so older server payloads remain fully compatible.
func rootineTaskIsDoneOnDate(_ task: WorkspaceTask, dateKey: String = RootineDate.localDate()) -> Bool {
    guard let schedule = task.schedule else { return task.done }
    // Some web payloads contain both maps, while older records contain only
    // one. Treat either source as authoritative and avoid an empty
    // `completedDates` array masking a populated timestamp map.
    if schedule.completedDates?.contains(dateKey) == true { return true }
    if schedule.completedAtByDate?[dateKey] != nil { return true }
    if schedule.completedDates != nil || schedule.completedAtByDate != nil { return false }
    return task.done
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

enum NutritionBarcode {
    /// Keep only stable barcode characters so camera separators and scanner
    /// whitespace cannot create duplicate pending requests.
    static func normalized(_ value: String) -> String {
        value
            .uppercased()
            .filter { $0.isLetter || $0.isNumber }
    }

    static func requestID(for barcode: String) -> String {
        RootineLocalIdentifier.string(namespace: "nutrition-barcode", operationID: normalized(barcode))
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
        case "urzędy": return Self.urzedy.rawValue
        case "zdrowie": return Self.zdrowie.rawValue
        case "dom": return Self.dom.rawValue
        case "auto": return Self.auto.rawValue
        case "finanse": return Self.finanse.rawValue
        case "dokumenty": return Self.dokumenty.rawValue
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
}
