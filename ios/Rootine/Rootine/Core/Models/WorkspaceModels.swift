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
    /// Private copy of the complete notes document. Native Notes only edits
    /// the fields in `NoteRecord`; this shadow keeps opaque web fields (for
    /// example future editor metadata or attachment descriptors) intact when
    /// a note is changed offline and uploaded later.
    case notesCanonicalShadow = "rootine.canonical-shadow.notes.v1"
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
