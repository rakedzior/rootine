import Foundation

// MARK: - Canonical Sport vocabulary

/// The values intentionally mirror the web Sport planner contract. Unknown
/// values are represented by `custom` at the native boundary instead of
/// making a remote record impossible to read.
enum SportDiscipline: String, Codable, CaseIterable, Sendable {
    case strength
    case running
    case rehab
    case mobility
    case cycling
    case custom

    init(rawValue: String) {
        switch rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "strength": self = .strength
        case "running": self = .running
        case "rehab": self = .rehab
        case "mobility": self = .mobility
        case "cycling": self = .cycling
        default: self = .custom
        }
    }
}

enum SportExerciseType: String, Codable, CaseIterable, Sendable {
    case strength
    case duration
    case distance
    case mobility
    case stage
}

enum SportMetricMode: String, Codable, CaseIterable, Sendable {
    case strength
    case time
    case distance
    case timeDistance = "time-distance"
    case all
}

enum SportStageKind: String, Codable, CaseIterable, Sendable {
    case warmup
    case steady
    case interval
    case recovery
    case cooldown
    case rest
}

enum SportScheduledWorkoutStatus: String, Codable, CaseIterable, Sendable {
    case scheduled
    case started
    case completed
    case skipped
    case rescheduled
    case canceled
}

enum SportSessionStatus: String, Codable, CaseIterable, Sendable {
    case scheduled
    case inProgress = "in_progress"
    case completed
    case incomplete
    case missed
}

enum SportHistoryStatus: String, Codable, CaseIterable, Sendable {
    case completed
    case incomplete
    case missed
}

enum SportHistoryUnitKind: String, Codable, CaseIterable, Sendable {
    case sets
    case stages
}

enum SportUnitSystem: String, Codable, CaseIterable, Sendable {
    case metric
    case imperial
}

enum SportUnit: String, Codable, CaseIterable, Sendable {
    case kilograms = "kg"
    case pounds = "lb"
    case meters = "m"
    case kilometers = "km"
    case miles = "mi"
    case seconds = "s"
    case minutes = "min"
}

// MARK: - Canonical records

struct SportExerciseDefaultParameters: Codable, Equatable, Sendable {
    var sets: Int?
    var repRange: String?
    var durationSeconds: Int?
    var distanceMeters: Double?
    var restSeconds: Int?
    var rir: Double?
    var rpe: Double?
    var tempo: String?

    init(
        sets: Int? = nil,
        repRange: String? = nil,
        durationSeconds: Int? = nil,
        distanceMeters: Double? = nil,
        restSeconds: Int? = nil,
        rir: Double? = nil,
        rpe: Double? = nil,
        tempo: String? = nil
    ) {
        self.sets = sets
        self.repRange = repRange
        self.durationSeconds = durationSeconds
        self.distanceMeters = distanceMeters
        self.restSeconds = restSeconds
        self.rir = rir
        self.rpe = rpe
        self.tempo = tempo
    }
}

struct SportExercise: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var sportCategory: SportDiscipline
    var primaryMuscle: String
    var secondaryMuscles: [String]
    var equipment: [String]
    var exerciseType: SportExerciseType
    var description: String
    var instructions: String
    var defaultParameters: SportExerciseDefaultParameters
    var note: String?
    var instructionalLink: String?
    var favorite: Bool
    var archived: Bool
    var createdAt: String
    var updatedAt: String

    func validate(path: String = "exercise") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(name, path: "\(path).name")
        try SportValidation.text(primaryMuscle, path: "\(path).primaryMuscle")
        try SportValidation.timestamp(createdAt, path: "\(path).createdAt")
        try SportValidation.timestamp(updatedAt, path: "\(path).updatedAt")
        try SportValidation.nonNegative(defaultParameters.durationSeconds, path: "\(path).defaultParameters.durationSeconds")
        try SportValidation.nonNegative(defaultParameters.distanceMeters, path: "\(path).defaultParameters.distanceMeters")
        try SportValidation.nonNegative(defaultParameters.restSeconds, path: "\(path).defaultParameters.restSeconds")
        try SportValidation.range(defaultParameters.rir, 0...10, path: "\(path).defaultParameters.rir")
        try SportValidation.range(defaultParameters.rpe, 0...10, path: "\(path).defaultParameters.rpe")
        if let sets = defaultParameters.sets { try SportValidation.positive(sets, path: "\(path).defaultParameters.sets") }
    }
}

struct SportTemplateSeries: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var reps: Int?
    /// Weights in the canonical contract are always kilograms.
    var weight: Double?
    var rir: Double?
    var rpe: Double?
    var tempo: String?
    var durationSeconds: Int?
    var distanceMeters: Double?
    var restSeconds: Int?

    init(
        id: String,
        reps: Int? = nil,
        weight: Double? = nil,
        rir: Double? = nil,
        rpe: Double? = nil,
        tempo: String? = nil,
        durationSeconds: Int? = nil,
        distanceMeters: Double? = nil,
        restSeconds: Int? = nil
    ) {
        self.id = id
        self.reps = reps
        self.weight = weight
        self.rir = rir
        self.rpe = rpe
        self.tempo = tempo
        self.durationSeconds = durationSeconds
        self.distanceMeters = distanceMeters
        self.restSeconds = restSeconds
    }
}

struct SportStageDefinition: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var kind: SportStageKind
    var target: String?
    var durationSeconds: Int?
    var distanceMeters: Double?
    var pace: String?
    var note: String?

    init(
        id: String,
        name: String,
        kind: SportStageKind,
        target: String? = nil,
        durationSeconds: Int? = nil,
        distanceMeters: Double? = nil,
        pace: String? = nil,
        note: String? = nil
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.target = target
        self.durationSeconds = durationSeconds
        self.distanceMeters = distanceMeters
        self.pace = pace
        self.note = note
    }
}

struct SportWorkoutItemParameters: Codable, Equatable, Sendable {
    var sets: Int?
    var repRange: String?
    var durationSeconds: Int?
    var distanceMeters: Double?
    var restSeconds: Int?
    var rir: Double?
    var rpe: Double?
    var tempo: String?
    var weight: Double?
    var reps: Int?
    var timeSeconds: Int?
    var metricMode: SportMetricMode?
    var series: [SportTemplateSeries]?

    init(
        sets: Int? = nil,
        repRange: String? = nil,
        durationSeconds: Int? = nil,
        distanceMeters: Double? = nil,
        restSeconds: Int? = nil,
        rir: Double? = nil,
        rpe: Double? = nil,
        tempo: String? = nil,
        weight: Double? = nil,
        reps: Int? = nil,
        timeSeconds: Int? = nil,
        metricMode: SportMetricMode? = nil,
        series: [SportTemplateSeries]? = nil
    ) {
        self.sets = sets
        self.repRange = repRange
        self.durationSeconds = durationSeconds
        self.distanceMeters = distanceMeters
        self.restSeconds = restSeconds
        self.rir = rir
        self.rpe = rpe
        self.tempo = tempo
        self.weight = weight
        self.reps = reps
        self.timeSeconds = timeSeconds
        self.metricMode = metricMode
        self.series = series
    }
}

struct SportWorkoutTemplateItem: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var exerciseId: String?
    var stageDefinition: SportStageDefinition?
    var order: Int
    var parametersOverride: SportWorkoutItemParameters?
    var note: String?
    var supersetId: String?
    var supersetExerciseIds: [String]?
}

struct SportWorkoutTemplateSection: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var order: Int
    var items: [SportWorkoutTemplateItem]
}

struct SportWorkoutTemplate: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var discipline: SportDiscipline
    var description: String
    var exercises: [SportWorkoutExercise]
    var stages: [SportRunningStage]?
    var durationMinutes: Int
    var sportCategory: SportDiscipline?
    var sections: [SportWorkoutTemplateSection]?
    var archived: Bool?
    var createdAt: String?
    var updatedAt: String?

    init(
        id: String,
        name: String,
        discipline: SportDiscipline,
        description: String = "",
        exercises: [SportWorkoutExercise] = [],
        stages: [SportRunningStage]? = nil,
        durationMinutes: Int,
        sportCategory: SportDiscipline? = nil,
        sections: [SportWorkoutTemplateSection]? = nil,
        archived: Bool? = nil,
        createdAt: String? = nil,
        updatedAt: String? = nil
    ) {
        self.id = id
        self.name = name
        self.discipline = discipline
        self.description = description
        self.exercises = exercises
        self.stages = stages
        self.durationMinutes = durationMinutes
        self.sportCategory = sportCategory
        self.sections = sections
        self.archived = archived
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    func validate(path: String = "template") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(name, path: "\(path).name")
        try SportValidation.positive(durationMinutes, path: "\(path).durationMinutes")
        try SportValidation.unique(exercises.map(\.id), path: "\(path).exercises")
        for (index, exercise) in exercises.enumerated() { try exercise.validate(path: "\(path).exercises[\(index)]") }
        if let sections {
            try SportValidation.unique(sections.map(\.id), path: "\(path).sections")
            for (index, section) in sections.enumerated() {
                try section.validate(path: "\(path).sections[\(index)]")
            }
        }
    }

    var plannedSetCount: Int {
        if let sections, !sections.isEmpty {
            return sections.flatMap(\.items).reduce(0) { total, item in
                if let count = item.parametersOverride?.series?.count, count > 0 { return total + count }
                return total + (item.parametersOverride?.sets ?? 1)
            }
        }
        return exercises.reduce(0) { $0 + $1.sets.count }
    }
}

struct SportCycleWorkout: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var week: Int
    var day: Int
    var title: String
    var discipline: SportDiscipline
    var durationMinutes: Int
    var templateId: String?
    var seriesId: String?
    var time: String?
    var note: String?
    var status: SportScheduledWorkoutStatus?
    var contentSnapshot: [SportWorkoutTemplateSection]?
    var sourceTemplateVersion: String?
    var createdAt: String?
    var updatedAt: String?

    init(
        id: String,
        week: Int,
        day: Int,
        title: String,
        discipline: SportDiscipline,
        durationMinutes: Int,
        templateId: String? = nil,
        seriesId: String? = nil,
        time: String? = nil,
        note: String? = nil,
        status: SportScheduledWorkoutStatus? = nil,
        contentSnapshot: [SportWorkoutTemplateSection]? = nil,
        sourceTemplateVersion: String? = nil,
        createdAt: String? = nil,
        updatedAt: String? = nil
    ) {
        self.id = id
        self.week = week
        self.day = day
        self.title = title
        self.discipline = discipline
        self.durationMinutes = durationMinutes
        self.templateId = templateId
        self.seriesId = seriesId
        self.time = time
        self.note = note
        self.status = status
        self.contentSnapshot = contentSnapshot
        self.sourceTemplateVersion = sourceTemplateVersion
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    func validate(path: String = "cycleWorkout", maxWeeks: Int? = nil) throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.range(week, 1...(maxWeeks ?? max(week, 1)), path: "\(path).week")
        try SportValidation.range(day, 0...6, path: "\(path).day")
        try SportValidation.text(title, path: "\(path).title")
        try SportValidation.positive(durationMinutes, path: "\(path).durationMinutes")
        if let templateId { try SportValidation.identifier(templateId, path: "\(path).templateId") }
        if let seriesId { try SportValidation.identifier(seriesId, path: "\(path).seriesId") }
        if let createdAt { try SportValidation.timestamp(createdAt, path: "\(path).createdAt") }
        if let updatedAt { try SportValidation.timestamp(updatedAt, path: "\(path).updatedAt") }
        if let contentSnapshot {
            try SportValidation.unique(contentSnapshot.map(\.id), path: "\(path).contentSnapshot")
            for (index, section) in contentSnapshot.enumerated() {
                try section.validate(path: "\(path).contentSnapshot[\(index)]")
            }
        }
    }
}

struct SportTrainingCycle: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var startDate: String
    var weeks: Int
    var endDate: String?
    var repeatWeekly: Bool?
    var workouts: [SportCycleWorkout]
    var updatedAt: String

    init(
        id: String,
        name: String,
        startDate: String,
        weeks: Int,
        endDate: String? = nil,
        repeatWeekly: Bool? = nil,
        workouts: [SportCycleWorkout] = [],
        updatedAt: String
    ) {
        self.id = id
        self.name = name
        self.startDate = startDate
        self.weeks = weeks
        self.endDate = endDate
        self.repeatWeekly = repeatWeekly
        self.workouts = workouts
        self.updatedAt = updatedAt
    }

    var isIndefinite: Bool { endDate == nil }

    func validate(path: String = "cycle") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(name, path: "\(path).name")
        try SportValidation.localDate(startDate, path: "\(path).startDate")
        try SportValidation.range(weeks, 1...52, path: "\(path).weeks")
        if let endDate {
            try SportValidation.localDate(endDate, path: "\(path).endDate")
            guard endDate >= startDate else { throw SportValidationError.invalidRange("\(path).endDate") }
        }
        try SportValidation.timestamp(updatedAt, path: "\(path).updatedAt")
        try SportValidation.unique(workouts.map(\.id), path: "\(path).workouts")
        for (index, workout) in workouts.enumerated() {
            try workout.validate(path: "\(path).workouts[\(index)]", maxWeeks: weeks)
        }
    }
}

enum SportPlanSource: String, Codable, CaseIterable, Sendable {
    case manual
    case ai
}

enum SportTrainingPlanStatus: String, Codable, CaseIterable, Sendable {
    case draft
    case planned
    case active
    case paused
    case completed
    case archived
}

struct SportTrainingPlanBlock: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var startWeek: Int
    var endWeek: Int
    var focus: String

    func validate(path: String = "planBlock", maxWeeks: Int? = nil) throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(name, path: "\(path).name")
        let upperBound = maxWeeks ?? max(endWeek, 1)
        try SportValidation.range(startWeek, 1...upperBound, path: "\(path).startWeek")
        try SportValidation.range(endWeek, 1...upperBound, path: "\(path).endWeek")
        guard endWeek >= startWeek else { throw SportValidationError.invalidRange("\(path).endWeek") }
        try SportValidation.text(focus, path: "\(path).focus")
    }
}

/// Legacy web plans are retained as a first-class native value so a client
/// can edit a plan without flattening it into scheduled workout occurrences.
struct SportTrainingPlan: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var disciplines: [SportDiscipline]
    var weeks: Int
    var currentWeek: Int
    var active: Bool
    var sessionsPerWeek: Int
    var completedSessions: Int
    var totalSessions: Int
    var templateIds: [String]
    var source: SportPlanSource
    var startDate: String?
    var endDate: String?
    var durationWeeks: Int?
    var status: SportTrainingPlanStatus?
    var indefinite: Bool?
    var updatedAt: String?
    var blocks: [SportTrainingPlanBlock]?

    init(
        id: String,
        name: String,
        disciplines: [SportDiscipline],
        weeks: Int,
        currentWeek: Int,
        active: Bool,
        sessionsPerWeek: Int,
        completedSessions: Int,
        totalSessions: Int,
        templateIds: [String],
        source: SportPlanSource,
        startDate: String? = nil,
        endDate: String? = nil,
        durationWeeks: Int? = nil,
        status: SportTrainingPlanStatus? = nil,
        indefinite: Bool? = nil,
        updatedAt: String? = nil,
        blocks: [SportTrainingPlanBlock]? = nil
    ) {
        self.id = id
        self.name = name
        self.disciplines = disciplines
        self.weeks = weeks
        self.currentWeek = currentWeek
        self.active = active
        self.sessionsPerWeek = sessionsPerWeek
        self.completedSessions = completedSessions
        self.totalSessions = totalSessions
        self.templateIds = templateIds
        self.source = source
        self.startDate = startDate
        self.endDate = endDate
        self.durationWeeks = durationWeeks
        self.status = status
        self.indefinite = indefinite
        self.updatedAt = updatedAt
        self.blocks = blocks
    }

    var completionRatio: Double {
        guard totalSessions > 0 else { return 0 }
        return min(1, max(0, Double(completedSessions) / Double(totalSessions)))
    }

    func validate(path: String = "plan") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(name, path: "\(path).name")
        try SportValidation.range(weeks, 1...52, path: "\(path).weeks")
        try SportValidation.range(currentWeek, 1...weeks, path: "\(path).currentWeek")
        try SportValidation.positive(sessionsPerWeek, path: "\(path).sessionsPerWeek")
        try SportValidation.nonNegative(completedSessions, path: "\(path).completedSessions")
        try SportValidation.nonNegative(totalSessions, path: "\(path).totalSessions")
        guard completedSessions <= totalSessions else { throw SportValidationError.invalidRange("\(path).completedSessions") }
        try SportValidation.unique(templateIds, path: "\(path).templateIds")
        if let startDate { try SportValidation.localDate(startDate, path: "\(path).startDate") }
        if let endDate { try SportValidation.localDate(endDate, path: "\(path).endDate") }
        if let startDate, let endDate, endDate < startDate {
            throw SportValidationError.invalidRange("\(path).endDate")
        }
        if let durationWeeks { try SportValidation.range(durationWeeks, 1...52, path: "\(path).durationWeeks") }
        if let updatedAt { try SportValidation.timestamp(updatedAt, path: "\(path).updatedAt") }
        if let blocks {
            try SportValidation.unique(blocks.map(\.id), path: "\(path).blocks")
            for (index, block) in blocks.enumerated() {
                try block.validate(path: "\(path).blocks[\(index)]", maxWeeks: weeks)
            }
        }
    }
}

struct SportScheduledWorkout: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var planId: String
    var templateId: String?
    var date: String
    var scheduledTime: String?
    var name: String
    var sportCategory: SportDiscipline
    var plannedDuration: Int
    var status: SportScheduledWorkoutStatus
    var contentSnapshot: [SportWorkoutTemplateSection]
    var sourceTemplateVersion: String?
    var notes: String?
    var createdAt: String
    var updatedAt: String

    init(
        id: String,
        planId: String,
        templateId: String? = nil,
        date: String,
        scheduledTime: String? = nil,
        name: String,
        sportCategory: SportDiscipline,
        plannedDuration: Int,
        status: SportScheduledWorkoutStatus = .scheduled,
        contentSnapshot: [SportWorkoutTemplateSection] = [],
        sourceTemplateVersion: String? = nil,
        notes: String? = nil,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.planId = planId
        self.templateId = templateId
        self.date = date
        self.scheduledTime = scheduledTime
        self.name = name
        self.sportCategory = sportCategory
        self.plannedDuration = plannedDuration
        self.status = status
        self.contentSnapshot = contentSnapshot
        self.sourceTemplateVersion = sourceTemplateVersion
        self.notes = notes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    func validate(path: String = "scheduledWorkout") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.identifier(planId, path: "\(path).planId")
        try SportValidation.localDate(date, path: "\(path).date")
        try SportValidation.text(name, path: "\(path).name")
        try SportValidation.positive(plannedDuration, path: "\(path).plannedDuration")
        try SportValidation.timestamp(createdAt, path: "\(path).createdAt")
        try SportValidation.timestamp(updatedAt, path: "\(path).updatedAt")
        try SportValidation.unique(contentSnapshot.map(\.id), path: "\(path).contentSnapshot")
        for (index, section) in contentSnapshot.enumerated() {
            try section.validate(path: "\(path).contentSnapshot[\(index)]")
        }
    }
}

struct SportWorkoutSet: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var plannedReps: Int?
    var plannedSeconds: Int?
    var plannedWeight: Double?
    var actualReps: Int?
    var actualSeconds: Int?
    var actualWeight: Double?
    var rir: Double?
    var rpe: Double?
    var pain: Double?
    var tempo: String?
    var note: String?
    var done: Bool

    init(
        id: String,
        plannedReps: Int? = nil,
        plannedSeconds: Int? = nil,
        plannedWeight: Double? = nil,
        actualReps: Int? = nil,
        actualSeconds: Int? = nil,
        actualWeight: Double? = nil,
        rir: Double? = nil,
        rpe: Double? = nil,
        pain: Double? = nil,
        tempo: String? = nil,
        note: String? = nil,
        done: Bool = false
    ) {
        self.id = id
        self.plannedReps = plannedReps
        self.plannedSeconds = plannedSeconds
        self.plannedWeight = plannedWeight
        self.actualReps = actualReps
        self.actualSeconds = actualSeconds
        self.actualWeight = actualWeight
        self.rir = rir
        self.rpe = rpe
        self.pain = pain
        self.tempo = tempo
        self.note = note
        self.done = done
    }

    func validate(path: String = "set") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.nonNegative(plannedSeconds, path: "\(path).plannedSeconds")
        try SportValidation.nonNegative(actualSeconds, path: "\(path).actualSeconds")
        try SportValidation.nonNegative(plannedWeight, path: "\(path).plannedWeight")
        try SportValidation.nonNegative(actualWeight, path: "\(path).actualWeight")
        if let reps = plannedReps { try SportValidation.positive(reps, path: "\(path).plannedReps") }
        if let reps = actualReps { try SportValidation.positive(reps, path: "\(path).actualReps") }
        try SportValidation.range(rir, 0...10, path: "\(path).rir")
        try SportValidation.range(rpe, 0...10, path: "\(path).rpe")
        try SportValidation.range(pain, 0...10, path: "\(path).pain")
    }
}

struct SportWorkoutExercise: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var exerciseId: String
    var name: String
    var restSeconds: Int
    var note: String?
    var sets: [SportWorkoutSet]

    init(id: String, exerciseId: String, name: String, restSeconds: Int = 0, note: String? = nil, sets: [SportWorkoutSet] = []) {
        self.id = id
        self.exerciseId = exerciseId
        self.name = name
        self.restSeconds = restSeconds
        self.note = note
        self.sets = sets
    }

    func validate(path: String = "exercise") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.identifier(exerciseId, path: "\(path).exerciseId")
        try SportValidation.text(name, path: "\(path).name")
        try SportValidation.nonNegative(restSeconds, path: "\(path).restSeconds")
        try SportValidation.unique(sets.map(\.id), path: "\(path).sets")
        for (index, set) in sets.enumerated() {
            try set.validate(path: "\(path).sets[\(index)]")
        }
    }
}

struct SportRunningStage: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var label: String
    var kind: SportStageKind
    var target: String
    var done: Bool?

    init(id: String, label: String, kind: SportStageKind, target: String, done: Bool? = nil) {
        self.id = id
        self.label = label
        self.kind = kind
        self.target = target
        self.done = done
    }

    func validate(path: String = "stage") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(label, path: "\(path).label")
        try SportValidation.text(target, path: "\(path).target")
    }
}

struct SportWorkoutMetrics: Codable, Equatable, Sendable {
    var distanceKm: Double?
    var timeMinutes: Double?
    var averagePace: String?
    var averageHeartRate: Double?
    var maxHeartRate: Double?
    var rpe: Double?
    var pain: Double?
    /// Optional user/device supplied values. Calories are kcal and intensity
    /// is normalized to the same 0...10 scale as RPE.
    var calories: Double?
    var intensity: Double?

    init(
        distanceKm: Double? = nil,
        timeMinutes: Double? = nil,
        averagePace: String? = nil,
        averageHeartRate: Double? = nil,
        maxHeartRate: Double? = nil,
        rpe: Double? = nil,
        pain: Double? = nil,
        calories: Double? = nil,
        intensity: Double? = nil
    ) {
        self.distanceKm = distanceKm
        self.timeMinutes = timeMinutes
        self.averagePace = averagePace
        self.averageHeartRate = averageHeartRate
        self.maxHeartRate = maxHeartRate
        self.rpe = rpe
        self.pain = pain
        self.calories = calories
        self.intensity = intensity
    }

    func validate(path: String = "metrics") throws {
        try SportValidation.nonNegative(distanceKm, path: "\(path).distanceKm")
        try SportValidation.nonNegative(timeMinutes, path: "\(path).timeMinutes")
        try SportValidation.nonNegative(averageHeartRate, path: "\(path).averageHeartRate")
        try SportValidation.nonNegative(maxHeartRate, path: "\(path).maxHeartRate")
        try SportValidation.nonNegative(calories, path: "\(path).calories")
        try SportValidation.range(rpe, 0...10, path: "\(path).rpe")
        try SportValidation.range(pain, 0...10, path: "\(path).pain")
        try SportValidation.range(intensity, 0...10, path: "\(path).intensity")
        if let averageHeartRate, let maxHeartRate, averageHeartRate > maxHeartRate {
            throw SportValidationError.invalidRange("\(path).averageHeartRate")
        }
    }
}

struct SportWorkoutSession: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var cycleWorkoutId: String?
    var title: String
    var discipline: SportDiscipline
    var date: String
    var time: String?
    var plannedDurationMinutes: Int?
    var durationMinutes: Int
    var status: SportSessionStatus
    var planId: String?
    var templateId: String?
    var note: String?
    var location: String?
    var exercises: [SportWorkoutExercise]
    var stages: [SportRunningStage]?
    var importedFrom: String?
    /// Milliseconds since Unix epoch, matching the web model. The decoder
    /// accepts both this numeric form and ISO strings from relational reads.
    var startedAt: Int64?
    var completedAt: Int64?
    var restTimerRemaining: Int?
    var restTimerRunning: Bool?
    var restTimerUpdatedAt: Int64?
    var metrics: SportWorkoutMetrics?

    enum CodingKeys: String, CodingKey {
        case id, cycleWorkoutId, title, discipline, date, time, plannedDurationMinutes,
             durationMinutes, status, planId, templateId, note, location, exercises,
             stages, importedFrom, startedAt, completedAt, restTimerRemaining,
             restTimerRunning, restTimerUpdatedAt, metrics
    }

    init(
        id: String,
        cycleWorkoutId: String? = nil,
        title: String,
        discipline: SportDiscipline,
        date: String,
        time: String? = nil,
        plannedDurationMinutes: Int? = nil,
        durationMinutes: Int,
        status: SportSessionStatus,
        planId: String? = nil,
        templateId: String? = nil,
        note: String? = nil,
        location: String? = nil,
        exercises: [SportWorkoutExercise] = [],
        stages: [SportRunningStage]? = nil,
        importedFrom: String? = nil,
        startedAt: Int64? = nil,
        completedAt: Int64? = nil,
        restTimerRemaining: Int? = nil,
        restTimerRunning: Bool? = nil,
        restTimerUpdatedAt: Int64? = nil,
        metrics: SportWorkoutMetrics? = nil
    ) {
        self.id = id
        self.cycleWorkoutId = cycleWorkoutId
        self.title = title
        self.discipline = discipline
        self.date = date
        self.time = time
        self.plannedDurationMinutes = plannedDurationMinutes
        self.durationMinutes = durationMinutes
        self.status = status
        self.planId = planId
        self.templateId = templateId
        self.note = note
        self.location = location
        self.exercises = exercises
        self.stages = stages
        self.importedFrom = importedFrom
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.restTimerRemaining = restTimerRemaining
        self.restTimerRunning = restTimerRunning
        self.restTimerUpdatedAt = restTimerUpdatedAt
        self.metrics = metrics
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        cycleWorkoutId = try c.decodeIfPresent(String.self, forKey: .cycleWorkoutId)
        title = try c.decode(String.self, forKey: .title)
        discipline = try c.decodeIfPresent(SportDiscipline.self, forKey: .discipline) ?? .custom
        date = try c.decode(String.self, forKey: .date)
        time = try c.decodeIfPresent(String.self, forKey: .time)
        plannedDurationMinutes = try c.decodeIfPresent(Int.self, forKey: .plannedDurationMinutes)
        durationMinutes = try c.decode(Int.self, forKey: .durationMinutes)
        status = try c.decodeIfPresent(SportSessionStatus.self, forKey: .status) ?? .scheduled
        planId = try c.decodeIfPresent(String.self, forKey: .planId)
        templateId = try c.decodeIfPresent(String.self, forKey: .templateId)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        location = try c.decodeIfPresent(String.self, forKey: .location)
        exercises = try c.decodeIfPresent([SportWorkoutExercise].self, forKey: .exercises) ?? []
        stages = try c.decodeIfPresent([SportRunningStage].self, forKey: .stages)
        importedFrom = try c.decodeIfPresent(String.self, forKey: .importedFrom)
        startedAt = try SportFlexibleInt64.decodeIfPresent(from: c, key: .startedAt)
        completedAt = try SportFlexibleInt64.decodeIfPresent(from: c, key: .completedAt)
        restTimerRemaining = try c.decodeIfPresent(Int.self, forKey: .restTimerRemaining)
        restTimerRunning = try c.decodeIfPresent(Bool.self, forKey: .restTimerRunning)
        restTimerUpdatedAt = try SportFlexibleInt64.decodeIfPresent(from: c, key: .restTimerUpdatedAt)
        metrics = try c.decodeIfPresent(SportWorkoutMetrics.self, forKey: .metrics)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(cycleWorkoutId, forKey: .cycleWorkoutId)
        try c.encode(title, forKey: .title)
        try c.encode(discipline, forKey: .discipline)
        try c.encode(date, forKey: .date)
        try c.encodeIfPresent(time, forKey: .time)
        try c.encodeIfPresent(plannedDurationMinutes, forKey: .plannedDurationMinutes)
        try c.encode(durationMinutes, forKey: .durationMinutes)
        try c.encode(status, forKey: .status)
        try c.encodeIfPresent(planId, forKey: .planId)
        try c.encodeIfPresent(templateId, forKey: .templateId)
        try c.encodeIfPresent(note, forKey: .note)
        try c.encodeIfPresent(location, forKey: .location)
        try c.encode(exercises, forKey: .exercises)
        try c.encodeIfPresent(stages, forKey: .stages)
        try c.encodeIfPresent(importedFrom, forKey: .importedFrom)
        try c.encodeIfPresent(startedAt, forKey: .startedAt)
        try c.encodeIfPresent(completedAt, forKey: .completedAt)
        try c.encodeIfPresent(restTimerRemaining, forKey: .restTimerRemaining)
        try c.encodeIfPresent(restTimerRunning, forKey: .restTimerRunning)
        try c.encodeIfPresent(restTimerUpdatedAt, forKey: .restTimerUpdatedAt)
        try c.encodeIfPresent(metrics, forKey: .metrics)
    }
}

struct SportCompletedWorkoutItem: Codable, Equatable, Sendable {
    var scheduledItemId: String
    var exerciseId: String?
    var stageDefinition: SportStageDefinition?
    var sets: [SportWorkoutSet]?
    var done: Bool
    var skipped: Bool?
    var note: String?
}

struct SportWorkoutExecution: Codable, Equatable, Sendable {
    var scheduledWorkoutId: String
    var startedAt: String?
    var finishedAt: String?
    var actualDuration: Int
    var completedItems: [SportCompletedWorkoutItem]
    var resultSummary: SportWorkoutResultSummary
    var effortRating: Double?
    var wellbeingRating: Double?
    var notes: String?
}

struct SportWorkoutResultSummary: Codable, Equatable, Sendable {
    var completedSets: Int?
    var volumeKg: Double?
    var distanceKm: Double?
    var averagePace: String?
    var calories: Double?
    var intensity: Double?

    init(
        completedSets: Int? = nil,
        volumeKg: Double? = nil,
        distanceKm: Double? = nil,
        averagePace: String? = nil,
        calories: Double? = nil,
        intensity: Double? = nil
    ) {
        self.completedSets = completedSets
        self.volumeKg = volumeKg
        self.distanceKm = distanceKm
        self.averagePace = averagePace
        self.calories = calories
        self.intensity = intensity
    }
}

struct SportWorkoutHistoryEntry: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var discipline: SportDiscipline
    var date: String
    var plannedDurationMinutes: Int?
    var durationMinutes: Int
    var status: SportHistoryStatus
    var templateId: String?
    var completedUnits: Int?
    var totalUnits: Int?
    var unitKind: SportHistoryUnitKind?
    var volumeKg: Double?
    var distanceKm: Double?
    var averagePace: String?
    var averageHeartRate: Double?
    var rpe: Double?
    var pain: Double?
    var calories: Double?
    var intensity: Double?

    init(
        id: String,
        title: String,
        discipline: SportDiscipline,
        date: String,
        plannedDurationMinutes: Int? = nil,
        durationMinutes: Int,
        status: SportHistoryStatus,
        templateId: String? = nil,
        completedUnits: Int? = nil,
        totalUnits: Int? = nil,
        unitKind: SportHistoryUnitKind? = nil,
        volumeKg: Double? = nil,
        distanceKm: Double? = nil,
        averagePace: String? = nil,
        averageHeartRate: Double? = nil,
        rpe: Double? = nil,
        pain: Double? = nil,
        calories: Double? = nil,
        intensity: Double? = nil
    ) {
        self.id = id
        self.title = title
        self.discipline = discipline
        self.date = date
        self.plannedDurationMinutes = plannedDurationMinutes
        self.durationMinutes = durationMinutes
        self.status = status
        self.templateId = templateId
        self.completedUnits = completedUnits
        self.totalUnits = totalUnits
        self.unitKind = unitKind
        self.volumeKg = volumeKg
        self.distanceKm = distanceKm
        self.averagePace = averagePace
        self.averageHeartRate = averageHeartRate
        self.rpe = rpe
        self.pain = pain
        self.calories = calories
        self.intensity = intensity
    }
}

struct SportWorkoutOutcome: Codable, Equatable, Sendable {
    var status: SportHistoryStatus
    var sessionId: String?
    var updatedAt: String
}

struct SportPlannerState: Codable, Equatable, Sendable {
    var version: Int
    var storageSchemaVersion: Int
    var templates: [SportWorkoutTemplate]
    var activeCycle: SportTrainingCycle?
    var cycles: [SportTrainingCycle]
    var activeCycleId: String?
    var history: [SportWorkoutHistoryEntry]
    var sessions: [SportWorkoutSession]
    var workoutOutcomes: [String: SportWorkoutOutcome]
    var exercises: [SportExercise]
    var scheduledWorkouts: [SportScheduledWorkout]
    var executions: [SportWorkoutExecution]
    var recoveryDays: [String]?

    private enum CodingKeys: String, CodingKey {
        case version, storageSchemaVersion, templates, activeCycle, cycles, activeCycleId,
             history, sessions, workoutOutcomes, exercises, scheduledWorkouts, executions,
             recoveryDays
    }

    init(
        version: Int,
        storageSchemaVersion: Int,
        templates: [SportWorkoutTemplate],
        activeCycle: SportTrainingCycle?,
        cycles: [SportTrainingCycle],
        activeCycleId: String?,
        history: [SportWorkoutHistoryEntry],
        sessions: [SportWorkoutSession],
        workoutOutcomes: [String: SportWorkoutOutcome],
        exercises: [SportExercise] = [],
        scheduledWorkouts: [SportScheduledWorkout] = [],
        executions: [SportWorkoutExecution] = [],
        recoveryDays: [String]? = nil
    ) {
        self.version = version
        self.storageSchemaVersion = storageSchemaVersion
        self.templates = templates
        self.activeCycle = activeCycle
        self.cycles = cycles
        self.activeCycleId = activeCycleId
        self.history = history
        self.sessions = sessions
        self.workoutOutcomes = workoutOutcomes
        self.exercises = exercises
        self.scheduledWorkouts = scheduledWorkouts
        self.executions = executions
        self.recoveryDays = recoveryDays
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decode(Int.self, forKey: .version)
        storageSchemaVersion = try container.decode(Int.self, forKey: .storageSchemaVersion)
        templates = try container.decode([SportWorkoutTemplate].self, forKey: .templates)
        activeCycle = try container.decodeIfPresent(SportTrainingCycle.self, forKey: .activeCycle)
        cycles = try container.decode([SportTrainingCycle].self, forKey: .cycles)
        activeCycleId = try container.decodeIfPresent(String.self, forKey: .activeCycleId)
        history = try container.decode([SportWorkoutHistoryEntry].self, forKey: .history)
        sessions = try container.decode([SportWorkoutSession].self, forKey: .sessions)
        workoutOutcomes = try container.decode([String: SportWorkoutOutcome].self, forKey: .workoutOutcomes)
        // These roots were introduced after the original v5 envelope. Missing
        // values must remain valid so old web snapshots can be opened offline.
        exercises = try container.decodeIfPresent([SportExercise].self, forKey: .exercises) ?? []
        scheduledWorkouts = try container.decodeIfPresent([SportScheduledWorkout].self, forKey: .scheduledWorkouts) ?? []
        executions = try container.decodeIfPresent([SportWorkoutExecution].self, forKey: .executions) ?? []
        recoveryDays = try container.decodeIfPresent([String].self, forKey: .recoveryDays)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(version, forKey: .version)
        try container.encode(storageSchemaVersion, forKey: .storageSchemaVersion)
        try container.encode(templates, forKey: .templates)
        try container.encode(activeCycle, forKey: .activeCycle)
        try container.encode(cycles, forKey: .cycles)
        try container.encode(activeCycleId, forKey: .activeCycleId)
        try container.encode(history, forKey: .history)
        try container.encode(sessions, forKey: .sessions)
        try container.encode(workoutOutcomes, forKey: .workoutOutcomes)
        try container.encode(exercises, forKey: .exercises)
        try container.encode(scheduledWorkouts, forKey: .scheduledWorkouts)
        try container.encode(executions, forKey: .executions)
        try container.encodeIfPresent(recoveryDays, forKey: .recoveryDays)
    }

    static let empty = SportPlannerState(
        version: 5,
        storageSchemaVersion: 5,
        templates: [],
        activeCycle: nil,
        cycles: [],
        activeCycleId: nil,
        history: [],
        sessions: [],
        workoutOutcomes: [:],
        exercises: [],
        scheduledWorkouts: [],
        executions: [],
        recoveryDays: nil,
    )

    func validate() throws {
        guard version == 5, storageSchemaVersion == 5 else {
            throw SportValidationError.unsupportedVersion(version, storageSchemaVersion)
        }
        try SportValidation.unique(templates.map(\.id), path: "templates")
        try SportValidation.unique(exercises.map(\.id), path: "exercises")
        try SportValidation.unique(cycles.map(\.id), path: "cycles")
        try SportValidation.unique(scheduledWorkouts.map(\.id), path: "scheduledWorkouts")
        try SportValidation.unique(sessions.map(\.id), path: "sessions")
        try SportValidation.unique(history.map(\.id), path: "history")
        try SportValidation.unique(executions.map(\.scheduledWorkoutId), path: "executions")
        for (index, template) in templates.enumerated() { try template.validate(path: "templates[\(index)]") }
        if let activeCycle { try activeCycle.validate(path: "activeCycle") }
        for (index, cycle) in cycles.enumerated() { try cycle.validate(path: "cycles[\(index)]") }
        for (index, exercise) in exercises.enumerated() { try exercise.validate(path: "exercises[\(index)]") }
        for (index, scheduled) in scheduledWorkouts.enumerated() { try scheduled.validate(path: "scheduledWorkouts[\(index)]") }
        for (index, session) in sessions.enumerated() { try session.validate(path: "sessions[\(index)]") }
        for (index, entry) in history.enumerated() { try entry.validate(path: "history[\(index)]") }
        for (index, execution) in executions.enumerated() { try execution.validate(path: "executions[\(index)]") }
        for (id, outcome) in workoutOutcomes {
            try SportValidation.identifier(id, path: "workoutOutcomes.\(id)")
            try outcome.validate(path: "workoutOutcomes.\(id)")
        }
        if let activeCycle, !cycles.contains(where: { $0.id == activeCycle.id }) {
            throw SportValidationError.missingReference("activeCycle")
        }
        if let activeCycleId, activeCycle?.id != activeCycleId {
            throw SportValidationError.missingReference("activeCycleId")
        }
        try SportValidation.unique(recoveryDays ?? [], path: "recoveryDays")
        for (index, date) in (recoveryDays ?? []).enumerated() {
            try SportValidation.localDate(date, path: "recoveryDays[\(index)]")
        }
    }

    /// Stable ordering is useful for deterministic JSON hashes and means a
    /// local edit produces the same sync payload on every device.
    func normalizedForPersistence() -> SportPlannerState {
        var copy = self
        copy.version = 5
        copy.storageSchemaVersion = 5
        copy.templates.sort { $0.id < $1.id }
        copy.exercises.sort { $0.id < $1.id }
        copy.cycles.sort { $0.id < $1.id }
        copy.scheduledWorkouts.sort { $0.id < $1.id }
        copy.sessions.sort { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
        copy.history.sort { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
        copy.executions.sort { $0.scheduledWorkoutId < $1.scheduledWorkoutId }
        copy.recoveryDays = copy.recoveryDays?.sorted()
        return copy
    }
}

// Unprefixed aliases make the mapping to the web contract explicit for
// call-sites that already use the web vocabulary, while preserving the
// existing compact `SportWorkout` native UI record.
typealias Exercise = SportExercise
typealias WorkoutSet = SportWorkoutSet
typealias WorkoutExercise = SportWorkoutExercise
typealias WorkoutTemplate = SportWorkoutTemplate
typealias WorkoutTemplateItem = SportWorkoutTemplateItem
typealias WorkoutTemplateSection = SportWorkoutTemplateSection
typealias ScheduledWorkout = SportScheduledWorkout
typealias WorkoutSession = SportWorkoutSession
typealias WorkoutExecution = SportWorkoutExecution
typealias WorkoutHistoryEntry = SportWorkoutHistoryEntry
typealias WorkoutOutcome = SportWorkoutOutcome
typealias TrainingCycle = SportTrainingCycle
typealias CycleWorkout = SportCycleWorkout
typealias TrainingPlan = SportTrainingPlan
typealias PlanBlock = SportTrainingPlanBlock
typealias ExerciseDefaultParameters = SportExerciseDefaultParameters
typealias ExerciseType = SportExerciseType
typealias StageDefinition = SportStageDefinition
typealias WorkoutMetricMode = SportMetricMode
typealias WorkoutTemplateSeries = SportTemplateSeries
typealias CompletedWorkoutItem = SportCompletedWorkoutItem
typealias WorkoutResultSummary = SportWorkoutResultSummary
typealias UnitSystem = SportUnitSystem
typealias Unit = SportUnit

// MARK: - Validation

enum SportValidationError: Error, Equatable, Sendable {
    case empty(String)
    case invalidIdentifier(String)
    case invalidDate(String)
    case invalidTimestamp(String)
    case invalidNumber(String)
    case outOfRange(String, String)
    case duplicate(String, String)
    case invalidRange(String)
    case missingReference(String)
    case unsupportedVersion(Int, Int)
}

enum SportValidation {
    static func identifier(_ value: String, path: String) throws {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 180, !trimmed.contains(where: { $0.isWhitespace }) else {
            throw SportValidationError.invalidIdentifier(path)
        }
    }

    static func text(_ value: String, path: String) throws {
        guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw SportValidationError.empty(path)
        }
    }

    static func timestamp(_ value: String, path: String) throws {
        guard RootineDate.date(from: value) != nil else { throw SportValidationError.invalidTimestamp(path) }
    }

    static func localDate(_ value: String, path: String) throws {
        guard value.count == 10,
              value.enumerated().allSatisfy({ index, character in
                  index == 4 || index == 7 ? character == "-" : character.isNumber
              }),
              let date = sportParseDate(value),
              sportFormatDate(date) == value else {
            throw SportValidationError.invalidDate(path)
        }
    }

    static func positive(_ value: Int, path: String) throws {
        guard value > 0 else { throw SportValidationError.outOfRange(path, "> 0") }
    }

    static func nonNegative(_ value: Int?, path: String) throws {
        if let value, value < 0 { throw SportValidationError.outOfRange(path, ">= 0") }
    }

    static func nonNegative(_ value: Int64?, path: String) throws {
        if let value, value < 0 { throw SportValidationError.outOfRange(path, ">= 0") }
    }

    static func nonNegative(_ value: Double?, path: String) throws {
        if let value, !value.isFinite || value < 0 { throw SportValidationError.invalidNumber(path) }
    }

    static func range(_ value: Int, _ bounds: ClosedRange<Int>, path: String) throws {
        guard bounds.contains(value) else { throw SportValidationError.outOfRange(path, "\(bounds.lowerBound)...\(bounds.upperBound)") }
    }

    static func range(_ value: Double?, _ bounds: ClosedRange<Double>, path: String) throws {
        if let value, (!value.isFinite || !bounds.contains(value)) {
            throw SportValidationError.outOfRange(path, "\(bounds.lowerBound)...\(bounds.upperBound)")
        }
    }

    static func unique(_ values: [String], path: String) throws {
        var seen = Set<String>()
        for value in values {
            guard seen.insert(value).inserted else { throw SportValidationError.duplicate(path, value) }
        }
    }
}

extension SportStageDefinition {
    func validate(path: String = "stageDefinition") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(name, path: "\(path).name")
        try SportValidation.nonNegative(durationSeconds, path: "\(path).durationSeconds")
        try SportValidation.nonNegative(distanceMeters, path: "\(path).distanceMeters")
    }
}

extension SportTemplateSeries {
    func validate(path: String = "series") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        if let reps { try SportValidation.positive(reps, path: "\(path).reps") }
        try SportValidation.nonNegative(weight, path: "\(path).weight")
        try SportValidation.range(rir, 0...10, path: "\(path).rir")
        try SportValidation.range(rpe, 0...10, path: "\(path).rpe")
        try SportValidation.nonNegative(durationSeconds, path: "\(path).durationSeconds")
        try SportValidation.nonNegative(distanceMeters, path: "\(path).distanceMeters")
        try SportValidation.nonNegative(restSeconds, path: "\(path).restSeconds")
    }
}

extension SportWorkoutItemParameters {
    func validate(path: String = "parameters") throws {
        if let sets { try SportValidation.positive(sets, path: "\(path).sets") }
        try SportValidation.nonNegative(durationSeconds, path: "\(path).durationSeconds")
        try SportValidation.nonNegative(distanceMeters, path: "\(path).distanceMeters")
        try SportValidation.nonNegative(restSeconds, path: "\(path).restSeconds")
        try SportValidation.nonNegative(weight, path: "\(path).weight")
        if let reps { try SportValidation.positive(reps, path: "\(path).reps") }
        try SportValidation.nonNegative(timeSeconds, path: "\(path).timeSeconds")
        try SportValidation.range(rir, 0...10, path: "\(path).rir")
        try SportValidation.range(rpe, 0...10, path: "\(path).rpe")
        if let series {
            try SportValidation.unique(series.map(\.id), path: "\(path).series")
            for (index, item) in series.enumerated() { try item.validate(path: "\(path).series[\(index)]") }
        }
    }
}

extension SportWorkoutTemplateItem {
    func validate(path: String = "templateItem") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.nonNegative(order, path: "\(path).order")
        if let exerciseId { try SportValidation.identifier(exerciseId, path: "\(path).exerciseId") }
        if let stageDefinition { try stageDefinition.validate(path: "\(path).stageDefinition") }
        guard exerciseId != nil || stageDefinition != nil else {
            throw SportValidationError.missingReference("\(path).exerciseIdOrStageDefinition")
        }
        if let parametersOverride { try parametersOverride.validate(path: "\(path).parametersOverride") }
        if let supersetId { try SportValidation.identifier(supersetId, path: "\(path).supersetId") }
        if let supersetExerciseIds {
            try SportValidation.unique(supersetExerciseIds, path: "\(path).supersetExerciseIds")
            for id in supersetExerciseIds { try SportValidation.identifier(id, path: "\(path).supersetExerciseIds") }
        }
    }
}

extension SportWorkoutTemplateSection {
    func validate(path: String = "section") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(name, path: "\(path).name")
        try SportValidation.nonNegative(order, path: "\(path).order")
        try SportValidation.unique(items.map(\.id), path: "\(path).items")
        for (index, item) in items.enumerated() { try item.validate(path: "\(path).items[\(index)]") }
    }
}

extension SportWorkout {
    var canonicalDiscipline: SportDiscipline { SportDiscipline(rawValue: kind) }

    func validate(path: String = "workout") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(title, path: "\(path).title")
        try SportValidation.localDate(date, path: "\(path).date")
        try SportValidation.positive(minutes, path: "\(path).minutes")
        try SportValidation.text(kind, path: "\(path).kind")
        try SportValidation.timestamp(createdAt, path: "\(path).createdAt")
        if let updatedAt { try SportValidation.timestamp(updatedAt, path: "\(path).updatedAt") }
    }
}

extension SportWorkspace {
    func validate() throws {
        guard version == 1 else { throw SportValidationError.unsupportedVersion(version, 1) }
        try SportValidation.timestamp(updatedAt, path: "updatedAt")
        try SportValidation.unique(workouts.map(\.id), path: "workouts")
        for (index, workout) in workouts.enumerated() { try workout.validate(path: "workouts[\(index)]") }
    }

    /// Sanitizes the compact native projection before it is sent to the
    /// canonical writer. It does not invent dates or IDs, so invalid input is
    /// rejected by `validate()` instead of silently changing user data.
    func normalizedForPersistence() -> SportWorkspace {
        var copy = self
        copy.version = 1
        copy.workouts = copy.workouts.map { workout in
            var normalized = workout
            normalized.id = normalized.id.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.title = normalized.title.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.date = normalized.date.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.kind = normalized.kind.trimmingCharacters(in: .whitespacesAndNewlines)
            normalized.updatedAt = normalized.updatedAt?.trimmingCharacters(in: .whitespacesAndNewlines)
            return normalized
        }
        copy.workouts.sort { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
        return copy
    }
}

extension SportWorkoutSession {
    func validate(path: String = "session") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(title, path: "\(path).title")
        try SportValidation.localDate(date, path: "\(path).date")
        try SportValidation.positive(durationMinutes, path: "\(path).durationMinutes")
        if let plannedDurationMinutes { try SportValidation.positive(plannedDurationMinutes, path: "\(path).plannedDurationMinutes") }
        try SportValidation.nonNegative(startedAt, path: "\(path).startedAt")
        try SportValidation.nonNegative(completedAt, path: "\(path).completedAt")
        try SportValidation.nonNegative(restTimerRemaining, path: "\(path).restTimerRemaining")
        try SportValidation.nonNegative(restTimerUpdatedAt, path: "\(path).restTimerUpdatedAt")
        if let startedAt, let completedAt, completedAt < startedAt {
            throw SportValidationError.invalidRange("\(path).completedAt")
        }
        try SportValidation.unique(exercises.map(\.id), path: "\(path).exercises")
        for (index, exercise) in exercises.enumerated() { try exercise.validate(path: "\(path).exercises[\(index)]") }
        if let stages {
            try SportValidation.unique(stages.map(\.id), path: "\(path).stages")
            for (index, stage) in stages.enumerated() {
                try stage.validate(path: "\(path).stages[\(index)]")
            }
        }
        if let metrics { try metrics.validate(path: "\(path).metrics") }
    }
}

extension SportWorkoutHistoryEntry {
    func validate(path: String = "history") throws {
        try SportValidation.identifier(id, path: "\(path).id")
        try SportValidation.text(title, path: "\(path).title")
        try SportValidation.localDate(date, path: "\(path).date")
        try SportValidation.positive(durationMinutes, path: "\(path).durationMinutes")
        if let plannedDurationMinutes { try SportValidation.positive(plannedDurationMinutes, path: "\(path).plannedDurationMinutes") }
        try SportValidation.nonNegative(volumeKg, path: "\(path).volumeKg")
        try SportValidation.nonNegative(distanceKm, path: "\(path).distanceKm")
        if let completedUnits { try SportValidation.nonNegative(completedUnits, path: "\(path).completedUnits") }
        if let totalUnits { try SportValidation.nonNegative(totalUnits, path: "\(path).totalUnits") }
        if let completedUnits, let totalUnits, completedUnits > totalUnits {
            throw SportValidationError.invalidRange("\(path).completedUnits")
        }
        try SportValidation.nonNegative(averageHeartRate, path: "\(path).averageHeartRate")
        try SportValidation.nonNegative(calories, path: "\(path).calories")
        try SportValidation.range(rpe, 0...10, path: "\(path).rpe")
        try SportValidation.range(pain, 0...10, path: "\(path).pain")
        try SportValidation.range(intensity, 0...10, path: "\(path).intensity")
    }
}

extension SportWorkoutResultSummary {
    func validate(path: String = "resultSummary") throws {
        try SportValidation.nonNegative(completedSets, path: "\(path).completedSets")
        try SportValidation.nonNegative(volumeKg, path: "\(path).volumeKg")
        try SportValidation.nonNegative(distanceKm, path: "\(path).distanceKm")
        try SportValidation.nonNegative(calories, path: "\(path).calories")
        try SportValidation.range(intensity, 0...10, path: "\(path).intensity")
    }
}

extension SportCompletedWorkoutItem {
    func validate(path: String = "completedItem") throws {
        try SportValidation.identifier(scheduledItemId, path: "\(path).scheduledItemId")
        if let exerciseId { try SportValidation.identifier(exerciseId, path: "\(path).exerciseId") }
        if let stageDefinition { try stageDefinition.validate(path: "\(path).stageDefinition") }
        guard exerciseId != nil || stageDefinition != nil else {
            throw SportValidationError.missingReference("\(path).exerciseIdOrStageDefinition")
        }
        if let sets {
            try SportValidation.unique(sets.map(\.id), path: "\(path).sets")
            for (index, set) in sets.enumerated() { try set.validate(path: "\(path).sets[\(index)]") }
        }
        if skipped == true && done { throw SportValidationError.invalidRange("\(path).done") }
    }
}

extension SportWorkoutExecution {
    func validate(path: String = "execution") throws {
        try SportValidation.identifier(scheduledWorkoutId, path: "\(path).scheduledWorkoutId")
        if let startedAt { try SportValidation.timestamp(startedAt, path: "\(path).startedAt") }
        if let finishedAt { try SportValidation.timestamp(finishedAt, path: "\(path).finishedAt") }
        if let startedAt, let finishedAt,
           let start = RootineDate.date(from: startedAt),
           let finish = RootineDate.date(from: finishedAt), finish < start {
            throw SportValidationError.invalidRange("\(path).finishedAt")
        }
        try SportValidation.positive(actualDuration, path: "\(path).actualDuration")
        try SportValidation.unique(completedItems.map(\.scheduledItemId), path: "\(path).completedItems")
        for (index, item) in completedItems.enumerated() { try item.validate(path: "\(path).completedItems[\(index)]") }
        try resultSummary.validate(path: "\(path).resultSummary")
        try SportValidation.range(effortRating, 0...10, path: "\(path).effortRating")
        try SportValidation.range(wellbeingRating, 0...10, path: "\(path).wellbeingRating")
    }
}

extension SportWorkoutOutcome {
    func validate(path: String = "outcome") throws {
        try SportValidation.identifier(sessionId ?? "outcome", path: "\(path).sessionId")
        try SportValidation.timestamp(updatedAt, path: "\(path).updatedAt")
    }
}

// MARK: - Deterministic units, IDs and calculations

enum SportUnits {
    static let poundsPerKilogram = 2.2046226218487757
    static let metersPerMile = 1609.344

    static func kilograms(from value: Double, unit: SportUnit) -> Double? {
        guard value.isFinite, value >= 0 else { return nil }
        switch unit {
        case .kilograms: return value
        case .pounds: return value / poundsPerKilogram
        default: return nil
        }
    }

    static func pounds(fromKilograms value: Double) -> Double? {
        guard value.isFinite, value >= 0 else { return nil }
        return value * poundsPerKilogram
    }

    static func meters(from value: Double, unit: SportUnit) -> Double? {
        guard value.isFinite, value >= 0 else { return nil }
        switch unit {
        case .meters: return value
        case .kilometers: return value * 1_000
        case .miles: return value * metersPerMile
        default: return nil
        }
    }

    static func distance(_ meters: Double, in system: SportUnitSystem) -> (value: Double, unit: SportUnit)? {
        guard meters.isFinite, meters >= 0 else { return nil }
        return system == .metric ? (meters / 1_000, .kilometers) : (meters / metersPerMile, .miles)
    }

    static func rounded(_ value: Double, places: Int = 2) -> Double {
        guard value.isFinite else { return 0 }
        let factor = pow(10, Double(max(0, places)))
        return (value * factor).rounded() / factor
    }
}

enum SportDeterministicID {
    static func make(namespace: String, seed: String) -> String {
        let hash = fnv1a64("\(namespace):\(seed)")
        return "sport-\(namespace)-\(String(format: "%016llx", hash))"
    }

    private static func fnv1a64(_ value: String) -> UInt64 {
        value.utf8.reduce(14_695_981_039_346_656_037) { hash, byte in
            (hash ^ UInt64(byte)) &* 1_099_511_628_211
        }
    }
}

enum SportCalculations {
    static func totalUnits(in session: SportWorkoutSession) -> Int {
        if let stages = session.stages, !stages.isEmpty { return stages.count }
        return session.exercises.reduce(0) { $0 + $1.sets.count }
    }

    static func completedUnits(in session: SportWorkoutSession) -> Int {
        if let stages = session.stages, !stages.isEmpty { return stages.filter { $0.done == true }.count }
        return session.exercises.flatMap(\.sets).filter(\.done).count
    }

    static func volumeKg(in session: SportWorkoutSession) -> Double {
        session.exercises.flatMap(\.sets).filter(\.done).reduce(0) { result, set in
            result + (set.actualWeight ?? set.plannedWeight ?? 0) * Double(set.actualReps ?? set.plannedReps ?? 0)
        }
    }

    static func completionRatio(in session: SportWorkoutSession) -> Double {
        let total = totalUnits(in: session)
        guard total > 0 else { return session.status == .completed ? 1 : 0 }
        return Double(completedUnits(in: session)) / Double(total)
    }

    static func historyEntry(from session: SportWorkoutSession) -> SportWorkoutHistoryEntry? {
        guard let status = SportHistoryStatus(rawValue: session.status.rawValue) else { return nil }
        let total = totalUnits(in: session)
        let volume = volumeKg(in: session)
        return SportWorkoutHistoryEntry(
            id: session.id,
            title: session.title,
            discipline: session.discipline,
            date: session.date,
            plannedDurationMinutes: session.plannedDurationMinutes ?? session.durationMinutes,
            durationMinutes: session.durationMinutes,
            status: status,
            templateId: session.templateId,
            completedUnits: total > 0 ? completedUnits(in: session) : nil,
            totalUnits: total > 0 ? total : nil,
            unitKind: (session.stages?.isEmpty == false) ? .stages : (total > 0 ? .sets : nil),
            volumeKg: volume > 0 ? SportUnits.rounded(volume, places: 2) : nil,
            distanceKm: session.metrics?.distanceKm,
            averagePace: session.metrics?.averagePace,
            averageHeartRate: session.metrics?.averageHeartRate,
            rpe: session.metrics?.rpe,
            pain: session.metrics?.pain,
            calories: session.metrics?.calories,
            intensity: session.metrics?.intensity
        )
    }

    static func execution(from session: SportWorkoutSession) -> SportWorkoutExecution? {
        guard let workoutID = session.cycleWorkoutId else { return nil }
        var items = session.exercises.map { exercise in
            SportCompletedWorkoutItem(
                scheduledItemId: exercise.id,
                exerciseId: exercise.exerciseId,
                stageDefinition: nil,
                sets: exercise.sets,
                done: exercise.sets.contains(where: \.done),
                skipped: nil,
                note: exercise.note
            )
        }
        items.append(contentsOf: (session.stages ?? []).map { stage in
            SportCompletedWorkoutItem(
                scheduledItemId: stage.id,
                exerciseId: nil,
                stageDefinition: SportStageDefinition(
                    id: stage.id,
                    name: stage.label,
                    kind: stage.kind,
                    target: stage.target
                ),
                sets: nil,
                done: stage.done == true,
                skipped: nil,
                note: nil
            )
        })
        return SportWorkoutExecution(
            scheduledWorkoutId: workoutID,
            startedAt: nil,
            finishedAt: nil,
            actualDuration: session.durationMinutes,
            completedItems: items,
            resultSummary: SportWorkoutResultSummary(
                completedSets: completedUnits(in: session),
                volumeKg: volumeKg(in: session),
                distanceKm: session.metrics?.distanceKm,
                averagePace: session.metrics?.averagePace,
                calories: session.metrics?.calories,
                intensity: session.metrics?.intensity
            ),
            effortRating: session.metrics?.rpe,
            wellbeingRating: nil,
            notes: session.note
        )
    }

    static func cycleDate(cycle: SportTrainingCycle, week: Int, day: Int) -> String? {
        guard week >= 1, week <= cycle.weeks, day >= 0, day <= 6,
              let start = sportParseDate(cycle.startDate),
              let date = Calendar(identifier: .gregorian).date(byAdding: .day, value: (week - 1) * 7 + day, to: start) else { return nil }
        let key = sportFormatDate(date)
        if let endDate = cycle.endDate, key > endDate { return nil }
        return key
    }

    static func isScheduled(_ workout: SportCycleWorkout, in cycle: SportTrainingCycle, on date: String) -> Bool {
        guard let start = sportParseDate(cycle.startDate), let requested = sportParseDate(date), date >= cycle.startDate else { return false }
        if let endDate = cycle.endDate, date > endDate { return false }
        let calendar = Calendar(identifier: .gregorian)
        let difference = calendar.dateComponents([.day], from: start, to: requested).day ?? 0
        if cycle.isIndefinite { return workout.week == 1 && ((difference % 7) + 7) % 7 == workout.day }
        return cycleDate(cycle: cycle, week: workout.week, day: workout.day) == date
    }

    static func paceSecondsPerKilometer(distanceKm: Double, durationMinutes: Double) -> Double? {
        guard distanceKm.isFinite, distanceKm > 0, durationMinutes.isFinite, durationMinutes >= 0 else { return nil }
        return durationMinutes * 60 / distanceKm
    }

    static func formatPace(distanceKm: Double, durationMinutes: Double) -> String? {
        guard let seconds = paceSecondsPerKilometer(distanceKm: distanceKm, durationMinutes: durationMinutes) else { return nil }
        let whole = Int(seconds.rounded())
        return "\(whole / 60):\(String(format: "%02d", whole % 60))/km"
    }

    /// Deterministic kcal estimate using the standard MET formula. This is a
    /// fallback for manual sessions only; device-imported energy stays in the
    /// optional `metrics.calories` field and is never overwritten.
    static func estimatedCalories(
        discipline: SportDiscipline,
        durationMinutes: Double,
        bodyMassKg: Double,
        intensity: Double? = nil
    ) -> Double? {
        guard durationMinutes.isFinite, durationMinutes > 0,
              bodyMassKg.isFinite, bodyMassKg > 0 else { return nil }
        let baselineMET: Double
        switch discipline {
        case .strength: baselineMET = 5.0
        case .running: baselineMET = 8.0
        case .rehab: baselineMET = 3.5
        case .mobility: baselineMET = 2.5
        case .cycling: baselineMET = 7.0
        case .custom: baselineMET = 5.0
        }
        let multiplier = 0.5 + min(10, max(0, intensity ?? 5)) / 10
        return SportUnits.rounded(baselineMET * multiplier * 3.5 * bodyMassKg * durationMinutes / 200, places: 2)
    }
}

// MARK: - Local-first mutations and normalized sync projection

enum SportWorkspaceMutationKind: String, Codable, Equatable, Sendable {
    case upsertWorkout
    case deleteWorkout
    case setWorkoutCompletion
}

struct SportWorkspaceMutation: Codable, Equatable, Sendable {
    var operationID: String
    var kind: SportWorkspaceMutationKind
    var workoutID: String
    var workout: SportWorkout?
    var completed: Bool?
    var updatedAt: String

    init(
        operationID: String,
        kind: SportWorkspaceMutationKind,
        workoutID: String,
        workout: SportWorkout? = nil,
        completed: Bool? = nil,
        updatedAt: String
    ) {
        self.operationID = operationID
        self.kind = kind
        self.workoutID = workoutID
        self.workout = workout
        self.completed = completed
        self.updatedAt = updatedAt
    }

    func validate() throws {
        try SportValidation.identifier(operationID, path: "operationID")
        try SportValidation.identifier(workoutID, path: "workoutID")
        try SportValidation.timestamp(updatedAt, path: "updatedAt")
        switch kind {
        case .upsertWorkout:
            guard let workout else { throw SportValidationError.missingReference("workout") }
            try workout.validate()
            guard workout.id == workoutID else { throw SportValidationError.missingReference("workoutID") }
        case .deleteWorkout:
            break
        case .setWorkoutCompletion:
            guard completed != nil else { throw SportValidationError.missingReference("completed") }
        }
    }
}

extension SportWorkspace {
    func applying(_ mutation: SportWorkspaceMutation) -> SportWorkspace {
        var copy = self
        let id = mutation.workoutID.trimmingCharacters(in: .whitespacesAndNewlines)
        switch mutation.kind {
        case .upsertWorkout:
            guard var workout = mutation.workout, workout.id == id else { return self }
            workout.updatedAt = mutation.updatedAt
            if let index = copy.workouts.firstIndex(where: { $0.id == id }) { copy.workouts[index] = workout } else { copy.workouts.append(workout) }
        case .deleteWorkout:
            copy.workouts.removeAll { $0.id == id }
        case .setWorkoutCompletion:
            guard let completed = mutation.completed, let index = copy.workouts.firstIndex(where: { $0.id == id }) else { return self }
            copy.workouts[index].completed = completed
            copy.workouts[index].updatedAt = mutation.updatedAt
        }
        copy.workouts.sort { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
        copy.updatedAt = mutation.updatedAt
        return copy
    }
}

enum SportSyncProjection {
    static let storageKey = "rootine-sport-planner-v1"

    /// Converts a local-first compact mutation into the normalized command
    /// vocabulary. The operation ID is caller supplied, so retries remain
    /// idempotent and work while the device is offline.
    static func command(
        for mutation: SportWorkspaceMutation,
        deviceID: String,
        baseRevision: Int64
    ) throws -> PendingSyncCommand {
        try mutation.validate()
        try SportValidation.identifier(deviceID, path: "deviceID")
        let entity = "sport_cycle_workout"
        let isDelete = mutation.kind == .deleteWorkout
        var payload: JSONValue = .null
        if !isDelete, let workout = mutation.workout {
            let data = try JSONEncoder.sportCanonical.encode(workout)
            payload = try JSONDecoder().decode(JSONValue.self, from: data)
        } else if mutation.kind == .setWorkoutCompletion {
            payload = .object(["status": .string(mutation.completed == true ? "completed" : "planned")])
        }
        return PendingSyncCommand(
            operationID: mutation.operationID,
            deviceID: deviceID,
            entity: entity,
            entityID: mutation.workoutID,
            kind: isDelete ? .delete : .upsert,
            baseRevision: baseRevision,
            payload: payload,
            createdAt: mutation.updatedAt
        )
    }
}

private extension JSONEncoder {
    static var sportCanonical: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

private enum SportFlexibleInt64 {
    static func decodeIfPresent<K: CodingKey>(from container: KeyedDecodingContainer<K>, key: K) throws -> Int64? {
        if let number = try? container.decode(Int64.self, forKey: key) { return number }
        guard let text = try? container.decode(String.self, forKey: key) else { return nil }
        if let number = Int64(text) { return number }
        return RootineDate.date(from: text).map { Int64(($0.timeIntervalSince1970 * 1_000).rounded()) }
    }
}

private func sportParseDate(_ value: String) -> Date? {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let formatter = DateFormatter()
    formatter.calendar = calendar
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = calendar.timeZone
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: value)
}

private func sportFormatDate(_ value: Date) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let components = calendar.dateComponents([.year, .month, .day], from: value)
    return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
}
