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

    var seenIDs = Set<String>()
    var retained: [WorkFocusSession] = []
    for session in workspace.focusSessions.reversed() {
        let normalizedID = session.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedID.isEmpty,
              RootineDate.date(from: session.startedAt) != nil,
              RootineDate.date(from: session.endedAt) != nil,
              session.minutes >= 0,
              seenIDs.insert(normalizedID).inserted else { continue }
        var normalized = session
        normalized.id = normalizedID
        retained.append(normalized)
    }
    sanitized.focusSessions = Array(retained.reversed())
    return sanitized
}

// MARK: Travel

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

typealias TravelTrip = TravelRecord

struct TravelBudgetSummary: Equatable, Sendable {
    var planned: Double
    var actual: Double
    var paid: Double
    var remaining: Double
    var reservationCommitted: Double
    var unbudgetedReservations: Double
}

/// Mirrors the web contract's currency normalization at the native boundary.
/// Invalid or unsupported values fall back to PLN so an offline draft remains
/// renderable and can be corrected before sync.
func normalizeTravelCurrency(_ value: String, fallback: String = "PLN") -> String {
    let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    let normalizedFallback = fallback.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    return rootineIsIsoCurrency(normalized)
        ? normalized
        : (rootineIsIsoCurrency(normalizedFallback) ? normalizedFallback : "PLN")
}

func isTravelDateWithinTrip(_ date: String, trip: TravelRecord) -> Bool {
    rootineTravelDateWithinTrip(date, trip: trip)
}

func summarizeTravelBudget(_ trip: TravelTrip) -> TravelBudgetSummary {
    let categories = ["transport", "stay", "food", "attractions", "shopping", "insurance", "other"]
    let stayTotal = trip.stays.reduce(0) { $0 + $1.amount }
    let stayPaid = trip.stays.filter { $0.status == "paid" }.reduce(0) { $0 + $1.amount }
    let transportTotal = trip.transports.reduce(0) { $0 + $1.amount }
    let transportPaid = trip.transports.filter { $0.status == "paid" }.reduce(0) { $0 + $1.amount }
    var planned = 0.0
    var actual = 0.0
    var paid = 0.0
    var unbudgeted = 0.0

    for category in categories {
        let lines = trip.budget.filter { $0.category == category }
        let categoryPlanned = lines.reduce(0) { $0 + $1.planned }
        let categoryActual = lines.reduce(0) { $0 + $1.actual }
        let categoryPaid = lines.filter(\.paid).reduce(0) { $0 + $1.actual }
        let reservationTotal = category == "stay" ? stayTotal : (category == "transport" ? transportTotal : 0)
        let reservationPaid = category == "stay" ? stayPaid : (category == "transport" ? transportPaid : 0)
        planned += max(categoryPlanned, reservationTotal)
        actual += max(categoryActual, reservationTotal)
        paid += max(categoryPaid, reservationPaid)
        unbudgeted += max(0, reservationTotal - categoryPlanned)
    }
    return TravelBudgetSummary(
        planned: planned,
        actual: actual,
        paid: paid,
        remaining: planned - actual,
        reservationCommitted: stayTotal + transportTotal,
        unbudgetedReservations: unbudgeted
    )
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
        guard !tripID.isEmpty else {
            issues.append(.missingTripID)
            continue
        }
        if !tripIDs.insert(tripID).inserted { issues.append(.duplicateTripID(tripID)) }
        if trip.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append(.missingTripName(tripID))
        }
        // Compact v1 records used a free-form dateRange and may legitimately
        // have no dates at all. Canonical v2 records always carry both keys;
        // preserve the old offline draft shape while validating v2 strictly.
        let datesAreLegacy = trip.startDate.isEmpty && trip.endDate.isEmpty
        if !datesAreLegacy {
            guard RootineDate.isLocalDateKey(trip.startDate), RootineDate.isLocalDateKey(trip.endDate), trip.endDate >= trip.startDate else {
                issues.append(.invalidTripDates(tripID)); continue
            }
        }
        if !["idea", "planning", "ready", "completed"].contains(trip.status) {
            issues.append(.invalidTripStatus(tripID))
        }
        if !rootineIsIsoCurrency(trip.baseCurrency) { issues.append(.invalidCurrency(tripID)) }
        if let timezone = trip.timezone, !RootineDate.isValidTimezone(timezone) {
            issues.append(.invalidTimezone(tripID))
        }

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
            if !item.time.isEmpty && !rootineIsClockTime(item.time) {
                issues.append(.invalidClockTime(tripID: tripID, id: item.id))
            }
            if let timezone = item.timezone, !RootineDate.isValidTimezone(timezone) {
                issues.append(.invalidTimezone(item.id))
            }
            if let startsAt = item.startsAt, let endsAt = item.endsAt,
               let start = rootineTravelInstant(startsAt, timezone: item.timezone ?? trip.timezone),
               let end = rootineTravelInstant(endsAt, timezone: item.timezone ?? trip.timezone), end < start {
                issues.append(.invalidChildDateOrder(tripID: tripID, collection: "itinerary", id: item.id))
            } else if (item.startsAt != nil && rootineTravelInstant(item.startsAt!, timezone: item.timezone ?? trip.timezone) == nil)
                        || (item.endsAt != nil && rootineTravelInstant(item.endsAt!, timezone: item.timezone ?? trip.timezone) == nil) {
                issues.append(.invalidChildDates(tripID: tripID, collection: "itinerary", id: item.id))
            }
        }
        for stay in trip.stays {
            validateTravelAmount(stay.amount, tripID: tripID, collection: "stays", id: stay.id, into: &issues)
            validateTravelRange(stay.checkIn, stay.checkOut, trip: trip, collection: "stays", id: stay.id, timezone: stay.timezone ?? trip.timezone, into: &issues)
            if let currency = stay.currency, !rootineIsIsoCurrency(currency) { issues.append(.invalidCurrency(stay.id)) }
            if !["planned", "booked", "paid"].contains(stay.status) {
                issues.append(.invalidChildStatus(tripID: tripID, collection: "stays", id: stay.id))
            }
        }
        for transport in trip.transports {
            validateTravelAmount(transport.amount, tripID: tripID, collection: "transports", id: transport.id, into: &issues)
            if let currency = transport.currency, !rootineIsIsoCurrency(currency) { issues.append(.invalidCurrency(transport.id)) }
            if !["plane", "train", "car", "bus", "ferry", "other"].contains(transport.mode) {
                issues.append(.invalidChildStatus(tripID: tripID, collection: "transports", id: transport.id))
            }
            if !["planned", "booked", "paid"].contains(transport.status) {
                issues.append(.invalidChildStatus(tripID: tripID, collection: "transports", id: transport.id))
            }
            let hasDeparture = !transport.departure.isEmpty
            let hasArrival = !transport.arrival.isEmpty
            if hasDeparture != hasArrival {
                issues.append(.invalidChildDateOrder(tripID: tripID, collection: "transports", id: transport.id))
            } else if hasDeparture {
                validateTravelRange(transport.departure, transport.arrival, trip: trip, collection: "transports", id: transport.id, timezone: transport.timezone ?? trip.timezone, into: &issues)
            }
        }
        for booking in trip.bookings {
            if let minor = booking.amountMinor, minor < 0 {
                issues.append(.invalidAmount(tripID: tripID, collection: "bookings", id: booking.id))
            }
            if let timezone = booking.timezone, !RootineDate.isValidTimezone(timezone) {
                issues.append(.invalidTimezone(booking.id))
            }
            if let currency = booking.currencyCode, !rootineIsIsoCurrency(currency) { issues.append(.invalidCurrency(booking.id)) }
            if !["planned", "booked", "paid", "cancelled", "completed"].contains(booking.status) {
                issues.append(.invalidChildStatus(tripID: tripID, collection: "bookings", id: booking.id))
            }
            if let startsAt = booking.startsAt, let endsAt = booking.endsAt {
                validateTravelRange(startsAt, endsAt, trip: trip, collection: "bookings", id: booking.id, timezone: booking.timezone ?? trip.timezone, into: &issues)
            }
        }
        for line in trip.budget {
            validateTravelAmount(line.planned, tripID: tripID, collection: "budget", id: line.id, into: &issues)
            validateTravelAmount(line.actual, tripID: tripID, collection: "budget", id: line.id, into: &issues)
            if let currency = line.currency, !rootineIsIsoCurrency(currency) { issues.append(.invalidCurrency(line.id)) }
            if !["transport", "stay", "food", "attractions", "shopping", "insurance", "other"].contains(line.category) {
                issues.append(.invalidChildStatus(tripID: tripID, collection: "budget", id: line.id))
            }
        }
        for document in trip.documents where !["todo", "pending", "ready"].contains(document.status) {
            issues.append(.invalidChildStatus(tripID: tripID, collection: "documents", id: document.id))
        }
        for document in trip.documents where !document.expiresAt.isEmpty && !RootineDate.isLocalDateKey(document.expiresAt) {
            issues.append(.invalidChildDates(tripID: tripID, collection: "documents", id: document.id))
        }
        for item in trip.packingItems where item.quantity <= 0 {
            issues.append(.invalidQuantity(tripID: tripID, id: item.id))
        }
        for task in trip.tasks {
            if !task.dueDate.isEmpty && !RootineDate.isLocalDateKey(task.dueDate) {
                issues.append(.invalidChildDates(tripID: tripID, collection: "tasks", id: task.id))
            }
            if !["booking", "documents", "health", "packing", "money", "other"].contains(task.category) {
                issues.append(.invalidChildStatus(tripID: tripID, collection: "tasks", id: task.id))
            }
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
    guard value.count == 5, value[value.index(value.startIndex, offsetBy: 2)] == ":" else { return false }
    let hour = Int(value.prefix(2)) ?? -1
    let minute = Int(value.suffix(2)) ?? -1
    return (0...23).contains(hour) && (0...59).contains(minute)
}

private func rootineIsIsoCurrency(_ value: String) -> Bool {
    let code = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    return code.count == 3 && code.unicodeScalars.allSatisfy { CharacterSet.uppercaseLetters.contains($0) }
        && Locale.commonISOCurrencyCodes.contains(code)
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

    static func localDate(_ date: Date, timezone: String?) -> String {
        guard let timezone, let zone = TimeZone(identifier: timezone) else { return localDate(date) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return localDate(date, calendar: calendar)
    }

    static func dateOnly(from value: String, timezone: String = "UTC") -> Date? {
        guard value.count == 10,
              value[value.index(value.startIndex, offsetBy: 4)] == "-",
              value[value.index(value.startIndex, offsetBy: 7)] == "-",
              let zone = TimeZone(identifier: timezone) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              (1...12).contains(parts[1]),
              (1...31).contains(parts[2]),
              let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        let normalized = calendar.dateComponents([.year, .month, .day], from: date)
        guard normalized.year == parts[0], normalized.month == parts[1], normalized.day == parts[2] else { return nil }
        return date
    }

    /// Parses the web contract's local `YYYY-MM-DDTHH:mm` value in an IANA
    /// timezone. Explicit-offset ISO timestamps continue to use `date(from:)`.
    static func date(fromLocalDateTime value: String, timezone: String) -> Date? {
        guard let zone = TimeZone(identifier: timezone),
              value.count == 16,
              value[value.index(value.startIndex, offsetBy: 10)] == "T",
              value[value.index(value.startIndex, offsetBy: 13)] == ":" else { return nil }
        let datePart = String(value.prefix(10))
        let hourPart = String(value.dropFirst(11).prefix(2))
        let minutePart = String(value.dropFirst(14).prefix(2))
        guard isLocalDateKey(datePart), let hour = Int(hourPart), let minute = Int(minutePart),
              (0...23).contains(hour), (0...59).contains(minute) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        guard let date = calendar.date(from: DateComponents(year: Int(datePart.prefix(4)), month: Int(datePart.dropFirst(5).prefix(2)), day: Int(datePart.suffix(2)), hour: hour, minute: minute)) else { return nil }
        // Calendar normalizes nonexistent DST wall-clock values. Reject that
        // normalization so a trip never silently moves across a boundary.
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        guard parts.year == Int(datePart.prefix(4)),
              parts.month == Int(datePart.dropFirst(5).prefix(2)),
              parts.day == Int(datePart.suffix(2)),
              parts.hour == hour, parts.minute == minute else { return nil }
        return date
    }

    static func isLocalDateKey(_ value: String) -> Bool {
        guard value.count == 10,
              value[value.index(value.startIndex, offsetBy: 4)] == "-",
              value[value.index(value.startIndex, offsetBy: 7)] == "-" else { return false }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]), (1...31).contains(parts[2]),
              let date = dateOnly(from: value) else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return localDate(date, calendar: calendar) == value
    }

    static func isValidTimezone(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && TimeZone(identifier: trimmed) != nil
    }
}
