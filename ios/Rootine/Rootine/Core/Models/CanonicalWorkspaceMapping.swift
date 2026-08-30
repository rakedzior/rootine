import Foundation

/// The native More screens deliberately use smaller view models than the web
/// workspaces. This boundary translates those models to the canonical
/// documents before a snapshot enters the shared sync queue.
enum RootineCanonicalWorkspaceMapping {
    static func shadowKey(for key: RootineStorageKey) -> RootineStorageKey? {
        switch key {
        case .sport: return .sportCanonicalShadow
        case .goals: return .goalsCanonicalShadow
        case .work: return .workCanonicalShadow
        case .travel: return .travelCanonicalShadow
        case .health: return .healthCanonicalShadow
        default: return nil
        }
    }

    static func storageKey(for key: RootineStorageKey) -> String {
        switch key {
        case .sport: return "rootine-sport-planner-v1"
        case .goals: return "rootine.goals.v1"
        case .work: return "rootine.work-workspace.v1"
        case .travel: return "rootine.travel-workspace.v1"
        case .health: return "rootine.health.workspace.v1"
        default: return key.rawValue
        }
    }

    static func payload(for workspace: SportWorkspace) throws -> JSONValue {
        let history = workspace.workouts.filter(\.completed).map { workout in
            CanonicalSportHistory(
                id: workout.id,
                title: workout.title,
                discipline: discipline(for: workout.kind),
                date: validDate(workout.date),
                plannedDurationMinutes: max(1, workout.minutes),
                durationMinutes: max(1, workout.minutes),
                status: "completed"
            )
        }
        let scheduled = workspace.workouts.filter { !$0.completed }.map { workout in
            CanonicalSportScheduled(
                id: workout.id,
                planId: "native-ios",
                date: validDate(workout.date),
                name: workout.title,
                sportCategory: discipline(for: workout.kind),
                plannedDuration: max(1, workout.minutes),
                status: "scheduled",
                contentSnapshot: [],
                notes: workout.kind,
                createdAt: workout.createdAt,
                updatedAt: workout.createdAt
            )
        }
        let sessions = history.map { item in
            CanonicalSportSession(
                id: item.id,
                cycleWorkoutId: item.id,
                title: item.title,
                discipline: item.discipline,
                date: item.date,
                plannedDurationMinutes: item.plannedDurationMinutes,
                durationMinutes: item.durationMinutes,
                status: "completed",
                exercises: []
            )
        }
        let outcomes = Dictionary(uniqueKeysWithValues: history.map { item in
            (item.id, CanonicalSportOutcome(status: "completed", sessionId: item.id, updatedAt: workspace.updatedAt))
        })
        let nativeCycles = try canonicalCycles(for: scheduled, updatedAt: workspace.updatedAt)
        return try jsonValue(CanonicalSportWorkspace(
            version: 5,
            storageSchemaVersion: 5,
            templates: [],
            activeCycle: nativeCycles.first,
            cycles: nativeCycles,
            activeCycleId: nativeCycles.isEmpty ? nil : "native-ios-cycle",
            history: history,
            sessions: sessions,
            workoutOutcomes: outcomes,
            exercises: [],
            scheduledWorkouts: scheduled,
            executions: []
        ))
    }

    static func sportWorkspace(from payload: JSONValue) throws -> SportWorkspace {
        let canonical = try decode(CanonicalSportWorkspace.self, from: payload)
        let sessionWorkoutIDs = Dictionary(uniqueKeysWithValues: canonical.sessions.map { ($0.id, $0.cycleWorkoutId ?? $0.id) })
        var workouts: [SportWorkout] = []
        var seen = Set<String>()
        for item in canonical.history {
            let workoutID = sessionWorkoutIDs[item.id] ?? item.id
            workouts.append(SportWorkout(
                id: workoutID,
                title: item.title,
                date: item.date,
                minutes: max(1, item.durationMinutes, item.plannedDurationMinutes ?? 1),
                kind: kind(for: item.discipline),
                completed: item.status == "completed",
                createdAt: canonicalSportUpdatedAt(canonical)
            ))
            seen.insert(workoutID)
        }
        for item in canonical.scheduledWorkouts ?? [] where !seen.contains(item.id) {
            workouts.append(SportWorkout(
                id: item.id,
                title: item.name,
                date: item.date,
                minutes: max(1, item.plannedDuration),
                kind: kind(for: item.sportCategory),
                completed: item.status == "completed",
                createdAt: item.createdAt
            ))
            seen.insert(item.id)
        }
        for item in canonical.sessions {
            let workoutID = item.cycleWorkoutId ?? item.id
            guard !seen.contains(workoutID) else { continue }
            workouts.append(SportWorkout(
                id: workoutID,
                title: item.title,
                date: item.date,
                minutes: max(1, item.durationMinutes, item.plannedDurationMinutes ?? 1),
                kind: kind(for: item.discipline),
                completed: item.status == "completed",
                createdAt: canonicalSportUpdatedAt(canonical)
            ))
            seen.insert(workoutID)
        }
        for cycleValue in canonical.cycles {
            guard let cycle = try? decode(CanonicalSportCycle.self, from: cycleValue) else { continue }
            for item in cycle.workouts where !seen.contains(item.id) {
                workouts.append(SportWorkout(
                    id: item.id,
                    title: item.title,
                    date: cycleWorkoutDate(cycle: cycle, week: item.week, day: item.day),
                    minutes: max(1, item.durationMinutes),
                    kind: kind(for: item.discipline),
                    completed: false,
                    createdAt: cycle.updatedAt
                ))
                seen.insert(item.id)
            }
        }
        return SportWorkspace(version: 1, updatedAt: canonicalSportUpdatedAt(canonical), workouts: workouts)
    }

    static func mergedSportPayload(for workspace: SportWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        let projectedPayload = try payload(for: workspace)
        let projected = try objectValue(projectedPayload)
        let canonical = try decode(CanonicalSportWorkspace.self, from: base)
        let nativeIDs = Set(workspace.workouts.map(\.id))
        let originalNativeIDs = Set((try? sportWorkspace(from: base))?.workouts.map(\.id) ?? [])
        let sessionIDsByWorkoutID: [String: String] = Dictionary(uniqueKeysWithValues: canonical.sessions.compactMap { session in
            guard let workoutID = session.cycleWorkoutId else { return nil }
            return (workoutID, session.id)
        })
        let managedWorkoutIDs = originalNativeIDs.union(nativeIDs)
        let managedRecordIDs = managedWorkoutIDs.union(sessionIDsByWorkoutID.values)
        let workoutIDBySessionID: [String: String] = Dictionary(uniqueKeysWithValues: sessionIDsByWorkoutID.map { ($0.value, $0.key) })
        let preservedHistoryIDs = Set(canonical.history.filter { $0.status != "completed" && nativeIDs.contains(workoutIDBySessionID[$0.id] ?? $0.id) }.map(\.id)).intersection(managedRecordIDs)
        let preservedSessionIDs = Set(canonical.sessions.filter { $0.status != "completed" && nativeIDs.contains(workoutIDBySessionID[$0.id] ?? $0.id) }.map(\.id)).intersection(managedRecordIDs)
        let preservedWorkoutIDs = Set(preservedHistoryIDs.union(preservedSessionIDs).map { workoutIDBySessionID[$0] ?? $0 }).intersection(nativeIDs)
        let projectedHistory = remappedRecordIDs(projected["history"], using: sessionIDsByWorkoutID)
        let projectedSessions = remappedRecordIDs(projected["sessions"], using: sessionIDsByWorkoutID)
        root["history"] = mergedSportRecords(existing: root["history"], projected: projectedHistory, managedIDs: managedRecordIDs, preservedIDs: preservedHistoryIDs, controlledKeys: ["id", "title", "discipline", "date", "plannedDurationMinutes", "durationMinutes", "status"])
        root["sessions"] = mergedSportRecords(existing: root["sessions"], projected: projectedSessions, managedIDs: managedRecordIDs, preservedIDs: preservedSessionIDs, controlledKeys: ["id", "title", "discipline", "date", "plannedDurationMinutes", "durationMinutes", "status"])
        root["scheduledWorkouts"] = mergedSportRecords(existing: root["scheduledWorkouts"], projected: projected["scheduledWorkouts"], managedIDs: managedWorkoutIDs, preservedIDs: [], controlledKeys: ["id", "date", "name", "sportCategory", "plannedDuration"])
        if var outcomes = objectValueIfPresent(root["workoutOutcomes"]) {
            if let projectedOutcomes = objectValueIfPresent(projected["workoutOutcomes"]) {
                for id in managedWorkoutIDs {
                    if let value = projectedOutcomes[id] {
                        outcomes[id] = mergeObjectFields(existing: outcomes[id] ?? .null, replacement: value, keys: ["status", "sessionId", "updatedAt"])
                    } else if !preservedWorkoutIDs.contains(id) {
                        outcomes.removeValue(forKey: id)
                    }
                }
            }
            root["workoutOutcomes"] = .object(outcomes)
        }

        let existingCycleWorkoutIDs = Set(canonical.cycles.flatMap { cycleValue in
            (try? decode(CanonicalSportCycle.self, from: cycleValue))?.workouts.map(\.id) ?? []
        })
        let allExistingIDs = Set(canonical.history.map(\.id))
            .union(canonical.sessions.map(\.id))
            .union((canonical.scheduledWorkouts ?? []).map(\.id))
            .union(existingCycleWorkoutIDs)
        let newlyAddedIDs = nativeIDs.subtracting(allExistingIDs)
        let removedCycleWorkoutIDs = existingCycleWorkoutIDs.subtracting(nativeIDs)
        if !removedCycleWorkoutIDs.isEmpty {
            root["cycles"] = .array(arrayValue(root["cycles"]).map { cycleWithoutWorkouts($0, ids: removedCycleWorkoutIDs) })
            if let activeCycle = root["activeCycle"] {
                root["activeCycle"] = cycleWithoutWorkouts(activeCycle, ids: removedCycleWorkoutIDs)
            }
        }
        if let projectedCycle = projected["activeCycle"] {
            let projectedCycleID = stringValue(objectValueIfPresent(projectedCycle)?["id"])
            var cycles = arrayValue(root["cycles"])
            if let cycleIndex = cycles.firstIndex(where: { stringValue(objectValueIfPresent($0)?["id"]) == projectedCycleID }), projectedCycleID == "native-ios-cycle" {
                let mergedCycle = mergedNativeCycle(existing: cycles[cycleIndex], projected: projectedCycle, nativeIDs: nativeIDs)
                cycles[cycleIndex] = mergedCycle
                root["cycles"] = .array(cycles)
                root["activeCycle"] = mergedCycle
                root["activeCycleId"] = .string("native-ios-cycle")
            } else if canonical.activeCycle == nil {
                root["activeCycle"] = projectedCycle
                root["activeCycleId"] = .string("native-ios-cycle")
                root["cycles"] = .array([projectedCycle])
            } else if !newlyAddedIDs.isEmpty, let cycle = try? decode(CanonicalSportCycle.self, from: projectedCycle) {
                let newCycle = CanonicalSportCycle(
                    id: cycle.id,
                    name: cycle.name,
                    startDate: cycle.startDate,
                    weeks: cycle.weeks,
                    endDate: cycle.endDate,
                    repeatWeekly: cycle.repeatWeekly,
                    workouts: cycle.workouts.filter { newlyAddedIDs.contains($0.id) },
                    updatedAt: cycle.updatedAt
                )
                cycles.append(try jsonValue(newCycle))
                root["cycles"] = .array(cycles)
            }
        }
        return .object(root)
    }

    static func payload(for workspace: GoalsWorkspace) throws -> JSONValue {
        let categories = [
            CanonicalGoalCategory(id: "personal", label: "Sprawy osobiste", color: "#8793A1", iconKey: "circle")
        ]
        let goals = workspace.goals.map { goal in
            let start = validDate(String(goal.createdAt.prefix(10)))
            let progress = CanonicalGoalProgress(
                id: "ios-progress-\(goal.id)",
                date: validDate(String(goal.updatedAt.prefix(10))),
                value: max(0, goal.current),
                kind: "absolute",
                note: "Postęp z aplikacji iOS",
                createdAt: goal.updatedAt
            )
            return CanonicalGoal(
                id: goal.id,
                title: goal.title,
                description: goal.detail,
                categoryId: "personal",
                iconKey: goalIcon(for: goal.icon),
                color: "#7FA6C9",
                status: goal.progress >= 1 ? "completed" : "active",
                health: "ontrack",
                priority: "medium",
                startDate: start,
                dueDate: maxDate(start, validDate(String(goal.updatedAt.prefix(10)))),
                progressMode: "numeric",
                regularityMode: nil,
                frequencyTarget: nil,
                frequencyPeriod: nil,
                initialValue: 0,
                targetValue: max(1, goal.target),
                unit: "kroków",
                manualProgress: 0,
                milestones: [],
                progressEntries: [progress],
                note: goal.detail,
                createdAt: goal.createdAt,
                updatedAt: goal.updatedAt
            )
        }
        return try jsonValue(CanonicalGoalsWorkspace(version: 1, goals: goals, categories: categories))
    }

    static func goalsWorkspace(from payload: JSONValue) throws -> GoalsWorkspace {
        let canonical = try decode(CanonicalGoalsWorkspace.self, from: payload)
        let goals = canonical.goals.map { goal in
            let current = goalCurrentValue(goal)
            return GoalRecord(
                id: goal.id,
                title: goal.title,
                detail: goal.description,
                current: max(0, current),
                target: max(1, goal.targetValue),
                icon: nativeIcon(for: goal.iconKey),
                createdAt: goal.createdAt,
                updatedAt: goal.updatedAt
            )
        }
        return GoalsWorkspace(version: 1, updatedAt: canonicalUpdatedAt(canonical.goals), goals: goals)
    }

    static func mergedGoalsPayload(for workspace: GoalsWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        let projectedPayload = try payload(for: workspace)
        let projected = try objectValue(projectedPayload)
        let nativeGoals = dictionaryByID(projected["goals"])
        let canonicalGoals = arrayValue(root["goals"])
        let decodedCanonical = try decode(CanonicalGoalsWorkspace.self, from: base)
        let decodedNative = try decode(CanonicalGoalsWorkspace.self, from: projectedPayload)
        var existingIDs = Set<String>()
        let mergedGoals = canonicalGoals.compactMap { value -> JSONValue? in
            guard var goal = objectValueIfPresent(value), let id = stringValue(goal["id"]), let native = nativeGoals[id] else {
                // Native projection contains every canonical goal. Missing
                // ids therefore represent an intentional native deletion.
                return nil
            }
            existingIDs.insert(id)
            for key in ["title", "description", "iconKey", "targetValue", "updatedAt"] {
                if let replacement = native[key] { goal[key] = replacement }
            }
            if let canonicalGoal = decodedCanonical.goals.first(where: { $0.id == id }),
               let nativeGoal = decodedNative.goals.first(where: { $0.id == id })
            {
                let current = goalCurrentValue(canonicalGoal)
                let nativeCurrent = goalCurrentValue(nativeGoal)
                if canonicalGoal.progressMode == "milestones", abs(current - nativeCurrent) > 0.0001 {
                    goal["milestones"] = updatedMilestones(goal["milestones"], desiredValue: nativeCurrent)
                } else if canonicalGoal.progressMode != "milestones", abs(current - nativeCurrent) > 0.0001 {
                    goal["progressEntries"] = updatedNumericProgressEntries(
                        existing: goal["progressEntries"],
                        goalID: id,
                        value: nativeCurrent,
                        updatedAt: stringValue(native["updatedAt"]) ?? RootineDate.isoTimestamp()
                    )
                }
            }
            return .object(goal)
        }
        var allGoals = mergedGoals
        if let projectedGoalValues = projected["goals"], case .array(let values) = projectedGoalValues {
            allGoals.append(contentsOf: values.filter { value in
                guard let id = stringValue(objectValueIfPresent(value)?["id"]) else { return false }
                return !existingIDs.contains(id)
            })
        }
        root["goals"] = .array(allGoals)
        if !decodedCanonical.categories.contains(where: { $0.id == "personal" }), let categories = projected["categories"] {
            var currentCategories = arrayValue(root["categories"])
            if case .array(let projectedCategories) = categories { currentCategories.append(contentsOf: projectedCategories) }
            root["categories"] = .array(currentCategories)
        }
        return .object(root)
    }

    static func payload(for workspace: WorkWorkspace) throws -> JSONValue {
        try jsonValue(CanonicalWorkWorkspace(
            version: 3,
            updatedAt: workspace.updatedAt,
            companies: [],
            projects: [],
            tasks: [],
            activeFocusStartedAt: workspace.activeFocusStartedAt,
            focusSessions: workspace.focusSessions
        ))
    }

    static func workWorkspace(from payload: JSONValue) throws -> WorkWorkspace {
        let canonical = try decode(CanonicalWorkWorkspace.self, from: payload)
        return WorkWorkspace(
            version: 1,
            updatedAt: canonical.updatedAt,
            activeFocusStartedAt: canonical.activeFocusStartedAt,
            focusSessions: canonical.focusSessions ?? []
        )
    }

    static func mergedWorkPayload(for workspace: WorkWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        root["updatedAt"] = .string(workspace.updatedAt)
        if let activeFocusStartedAt = workspace.activeFocusStartedAt {
            root["activeFocusStartedAt"] = .string(activeFocusStartedAt)
        } else {
            root.removeValue(forKey: "activeFocusStartedAt")
        }
        if !workspace.focusSessions.isEmpty || root["focusSessions"] != nil {
            root["focusSessions"] = try jsonValue(workspace.focusSessions)
        }
        return .object(root)
    }

    static func payload(for workspace: TravelWorkspace) throws -> JSONValue {
        let trips = workspace.trips.map { trip in
            let dates = travelDates(trip.dateRange, createdAt: trip.createdAt)
            return CanonicalTravelTrip(
                id: trip.id,
                name: trip.destination,
                destination: trip.destination,
                startDate: dates.start,
                endDate: dates.end,
                status: "planning",
                travelers: [],
                baseCurrency: "PLN",
                note: travelMigrationNote(trip, dates: dates),
                archivedAt: nil,
                stays: [],
                transports: [],
                itinerary: trip.itinerary.map { item in
                    CanonicalTravelItinerary(id: item.id, date: validDate(item.day), time: "", title: item.title, location: "", kind: "activity", note: travelItineraryNote(item), reserved: false)
                },
                budget: [],
                documents: [],
                tasks: []
            )
        }
        return try jsonValue(CanonicalTravelWorkspace(version: 2, updatedAt: workspace.updatedAt, trips: trips))
    }

    static func travelWorkspace(from payload: JSONValue) throws -> TravelWorkspace {
        let canonical = try decode(CanonicalTravelWorkspace.self, from: payload)
        let trips = canonical.trips.map { trip in
            let nights = max(1, calendarDays(from: trip.startDate, to: trip.endDate))
            return TravelRecord(
                id: trip.id,
                destination: trip.destination,
                dateRange: "\(trip.startDate) – \(trip.endDate)",
                nights: nights,
                itinerary: trip.itinerary.map { item in
                    TravelItineraryItem(id: item.id, day: item.date, title: item.title, detail: [item.location, item.note].filter { !$0.isEmpty }.joined(separator: " · "))
                },
                createdAt: canonical.updatedAt,
                updatedAt: canonical.updatedAt
            )
        }
        return TravelWorkspace(version: 1, updatedAt: canonical.updatedAt, trips: trips)
    }

    static func mergedTravelPayload(for workspace: TravelWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        let projected = try objectValue(payload(for: workspace))
        let nativeTrips = dictionaryByID(projected["trips"])
        let originalNative = try? travelWorkspace(from: base)
        let trips = arrayValue(root["trips"]).compactMap { value -> JSONValue? in
            guard var trip = objectValueIfPresent(value), let id = stringValue(trip["id"]), let native = nativeTrips[id] else {
                // Native projection contains every canonical trip; a missing
                // id is a native deletion, while nested web-only fields stay
                // untouched for trips that remain.
                return nil
            }
            let originalTrip = originalNative?.trips.first(where: { $0.id == id })
            for key in ["destination", "startDate", "endDate", "itinerary"] {
                if key == "itinerary" { continue }
                if let replacement = native[key] { trip[key] = replacement }
            }
            if let existingItinerary = trip["itinerary"] {
                trip["itinerary"] = mergedTravelItinerary(
                    existing: existingItinerary,
                    native: workspace.trips.first(where: { $0.id == id })?.itinerary ?? [],
                    original: originalTrip?.itinerary ?? []
                )
            }
            return .object(trip)
        }
        let existingIDs = Set(trips.compactMap { stringValue(objectValueIfPresent($0)?["id"]) })
        var allTrips = trips
        if case .array(let values) = projected["trips"] { allTrips.append(contentsOf: values.filter { !existingIDs.contains(stringValue(objectValueIfPresent($0)?["id"]) ?? "") }) }
        root["trips"] = .array(allTrips)
        root["updatedAt"] = .string(workspace.updatedAt)
        return .object(root)
    }

    static func payload(for workspace: HealthWorkspace) throws -> JSONValue {
        return try jsonValue(CanonicalHealthWorkspace(
            version: 1,
            entries: [],
            updatedAt: workspace.updatedAt,
            checkIns: workspace.checkIns,
            reminders: workspace.reminders
        ))
    }

    static func healthWorkspace(from payload: JSONValue) throws -> HealthWorkspace {
        let canonical = try decode(CanonicalHealthWorkspace.self, from: payload)
        return HealthWorkspace(version: 1, updatedAt: canonical.updatedAt, checkIns: canonical.checkIns ?? [:], reminders: canonical.reminders ?? [])
    }

    static func mergedHealthPayload(for workspace: HealthWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        root["updatedAt"] = .string(workspace.updatedAt)
        if !workspace.checkIns.isEmpty || root["checkIns"] != nil {
            root["checkIns"] = try jsonValue(workspace.checkIns)
        }
        if !workspace.reminders.isEmpty || root["reminders"] != nil {
            root["reminders"] = try jsonValue(workspace.reminders)
        }
        return .object(root)
    }

    private static func jsonValue<T: Encodable>(_ value: T) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
    }

    private static func objectValue(_ value: JSONValue) throws -> [String: JSONValue] {
        guard case .object(let object) = value else { throw MappingError.invalidObject }
        return object
    }

    private static func objectValueIfPresent(_ value: JSONValue?) -> [String: JSONValue]? {
        guard case .object(let object) = value else { return nil }
        return object
    }

    private static func arrayValue(_ value: JSONValue?) -> [JSONValue] {
        guard case .array(let array) = value else { return [] }
        return array
    }

    private static func stringValue(_ value: JSONValue?) -> String? {
        guard case .string(let string) = value else { return nil }
        return string
    }

    private static func dictionaryByID(_ value: JSONValue?) -> [String: [String: JSONValue]] {
        arrayValue(value).reduce(into: [:]) { result, item in
            guard let object = objectValueIfPresent(item), let id = stringValue(object["id"]) else { return }
            result[id] = object
        }
    }

    private static func remappedRecordIDs(_ value: JSONValue?, using mapping: [String: String]) -> JSONValue {
        .array(arrayValue(value).map { record in
            guard var object = objectValueIfPresent(record), let id = stringValue(object["id"]), let mappedID = mapping[id] else { return record }
            object["id"] = .string(mappedID)
            return .object(object)
        })
    }

    private static func mergedNativeRecords(existing: JSONValue?, projected: JSONValue?, nativeIDs: Set<String>, controlledKeys: [String]) -> JSONValue {
        let projectedRecords = arrayValue(projected)
        let projectedByID = Dictionary(uniqueKeysWithValues: projectedRecords.compactMap { record -> (String, JSONValue)? in
            guard let id = stringValue(objectValueIfPresent(record)?["id"]) else { return nil }
            return (id, record)
        })
        var usedIDs = Set<String>()
        var records: [JSONValue] = []
        for record in arrayValue(existing) {
            guard let id = stringValue(objectValueIfPresent(record)?["id"]), nativeIDs.contains(id) else {
                records.append(record)
                continue
            }
            if let replacement = projectedByID[id] {
                records.append(mergeObjectFields(existing: record, replacement: replacement, keys: controlledKeys))
                usedIDs.insert(id)
            }
        }
        records.append(contentsOf: projectedRecords.filter { record in
            guard let id = stringValue(objectValueIfPresent(record)?["id"]) else { return true }
            return !usedIDs.contains(id)
        })
        return .array(records)
    }

    private static func mergedSportRecords(existing: JSONValue?, projected: JSONValue?, managedIDs: Set<String>, preservedIDs: Set<String>, controlledKeys: [String]) -> JSONValue {
        let projectedRecords = arrayValue(projected)
        let projectedByID = Dictionary(uniqueKeysWithValues: projectedRecords.compactMap { record -> (String, JSONValue)? in
            guard let id = stringValue(objectValueIfPresent(record)?["id"]) else { return nil }
            return (id, record)
        })
        var usedIDs = Set<String>()
        var records: [JSONValue] = []
        for record in arrayValue(existing) {
            guard let id = stringValue(objectValueIfPresent(record)?["id"]) else {
                records.append(record)
                continue
            }
            guard managedIDs.contains(id) else {
                records.append(record)
                continue
            }
            if preservedIDs.contains(id), let replacement = projectedByID[id] {
                records.append(mergeObjectFields(existing: record, replacement: replacement, keys: controlledKeys))
                usedIDs.insert(id)
            } else if preservedIDs.contains(id) {
                records.append(record)
            } else if let replacement = projectedByID[id] {
                records.append(mergeObjectFields(existing: record, replacement: replacement, keys: controlledKeys))
                usedIDs.insert(id)
            }
        }
        records.append(contentsOf: projectedRecords.filter { record in
            guard let id = stringValue(objectValueIfPresent(record)?["id"]) else { return true }
            return !usedIDs.contains(id)
        })
        return .array(records)
    }

    private static func mergeObjectFields(existing: JSONValue, replacement: JSONValue, keys: [String]) -> JSONValue {
        guard var existingObject = objectValueIfPresent(existing), let replacementObject = objectValueIfPresent(replacement) else { return replacement }
        for key in keys {
            if let value = replacementObject[key] { existingObject[key] = value }
        }
        return .object(existingObject)
    }

    private static func cycleWithoutWorkouts(_ value: JSONValue, ids: Set<String>) -> JSONValue {
        guard var cycle = objectValueIfPresent(value), case .array(let workouts) = cycle["workouts"] else { return value }
        cycle["workouts"] = .array(workouts.filter { !ids.contains(stringValue(objectValueIfPresent($0)?["id"]) ?? "") })
        return .object(cycle)
    }

    private static func mergedNativeCycle(existing: JSONValue, projected: JSONValue, nativeIDs: Set<String>) -> JSONValue {
        guard var cycle = objectValueIfPresent(existing), let projectedCycle = objectValueIfPresent(projected) else { return projected }
        for key in ["id", "name", "startDate", "weeks", "endDate", "repeatWeekly", "updatedAt"] {
            if let value = projectedCycle[key] { cycle[key] = value }
        }
        cycle["workouts"] = mergedNativeRecords(
            existing: cycle["workouts"],
            projected: projectedCycle["workouts"],
            nativeIDs: nativeIDs,
            controlledKeys: ["id", "week", "day", "title", "discipline", "durationMinutes"]
        )
        return .object(cycle)
    }

    private static func mergedTravelItinerary(existing: JSONValue, native: [TravelItineraryItem], original: [TravelItineraryItem]) -> JSONValue {
        let nativeByID = Dictionary(uniqueKeysWithValues: native.map { ($0.id, $0) })
        let originalByID = Dictionary(uniqueKeysWithValues: original.map { ($0.id, $0) })
        let values = arrayValue(existing).map { value -> JSONValue in
            guard var item = objectValueIfPresent(value), let id = stringValue(item["id"]), let nativeItem = nativeByID[id] else { return value }
            if let originalItem = originalByID[id],
               nativeItem.day != originalItem.day || nativeItem.title != originalItem.title || nativeItem.detail != originalItem.detail
            {
                if nativeItem.day != originalItem.day { item["date"] = .string(validDate(nativeItem.day)) }
                if nativeItem.title != originalItem.title { item["title"] = .string(nativeItem.title) }
                if nativeItem.detail != originalItem.detail {
                    item["location"] = .string("")
                    item["note"] = .string(nativeItem.detail)
                }
            }
            return .object(item)
        }
        return .array(values)
    }

    private static func updatedNumericProgressEntries(existing: JSONValue?, goalID: String, value: Double, updatedAt: String) -> JSONValue {
        let entry: JSONValue = .object([
            "id": .string("ios-progress-\(goalID)"),
            "date": .string(validDate(String(updatedAt.prefix(10)))),
            "value": .number(value),
            "kind": .string("absolute"),
            "note": .string("Postęp z aplikacji iOS"),
            "createdAt": .string(updatedAt)
        ])
        var entries = arrayValue(existing)
        if let index = entries.firstIndex(where: { stringValue(objectValueIfPresent($0)?["id"]) == "ios-progress-\(goalID)" }) {
            entries[index] = entry
        } else {
            entries.append(entry)
        }
        return .array(entries)
    }

    private static func updatedMilestones(_ existing: JSONValue?, desiredValue: Double) -> JSONValue {
        var remaining = max(0, desiredValue)
        let milestones = arrayValue(existing).map { value -> JSONValue in
            guard var milestone = objectValueIfPresent(value) else { return value }
            let weight = numberValue(milestone["weight"]) ?? 1
            let done = remaining + 0.0001 >= weight
            milestone["done"] = .bool(done)
            if done { remaining -= weight }
            return .object(milestone)
        }
        return .array(milestones)
    }

    private static func numberValue(_ value: JSONValue?) -> Double? {
        guard case .number(let number) = value else { return nil }
        return number
    }

    private static func decode<T: Decodable>(_ type: T.Type, from value: JSONValue) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONEncoder().encode(value))
    }

    private static func validDate(_ value: String) -> String {
        let parts = value.split(separator: "-")
        guard parts.count == 3, parts.allSatisfy({ $0.count == 2 || $0.count == 4 }), Int(parts[0]) != nil, Int(parts[1]) != nil, Int(parts[2]) != nil else {
            return RootineDate.localDate()
        }
        return value
    }

    private static func maxDate(_ left: String, _ right: String) -> String {
        right >= left ? right : left
    }

    private static func discipline(for kind: String) -> String {
        switch kind.lowercased() {
        case "bieg", "bieganie", "running": return "running"
        case "rower", "cycling": return "cycling"
        case "mobilność", "mobility", "joga": return "mobility"
        case "rehabilitacja", "rehab": return "rehab"
        case "siłownia", "strength": return "strength"
        default: return "custom"
        }
    }

    private static func kind(for discipline: String) -> String {
        switch discipline {
        case "running": return "Bieg"
        case "cycling": return "Rower"
        case "mobility": return "Mobilność"
        case "rehab": return "Rehabilitacja"
        case "strength": return "Siłownia"
        default: return "Trening"
        }
    }

    private static func goalIcon(for icon: String) -> String {
        switch icon {
        case "figure.strengthtraining.traditional": return "dumbbell"
        case "figure.run": return "activity"
        case "laptop", "no-smoking", "activity", "languages", "piggy-bank", "dumbbell", "trophy", "sparkles", "target": return icon
        default: return "target"
        }
    }

    private static func nativeIcon(for icon: String) -> String {
        switch icon {
        case "dumbbell": return "figure.strengthtraining.traditional"
        case "activity": return "figure.run"
        case "target": return "target"
        default: return icon
        }
    }

    private static func travelDates(_ value: String, createdAt: String) -> (start: String, end: String) {
        let pieces = value.components(separatedBy: "–").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let fallback = validDate(String(createdAt.prefix(10)))
        let start = validDate(pieces.first ?? fallback)
        let end = validDate(pieces.count > 1 ? pieces[1] : start)
        return (start, end >= start ? end : start)
    }

    private static func travelMigrationNote(_ trip: TravelRecord, dates: (start: String, end: String)) -> String {
        let parsedRange = trip.dateRange.components(separatedBy: "–").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let hasExactRange = parsedRange.count == 2 && isLocalDate(parsedRange[0]) && isLocalDate(parsedRange[1])
        guard !hasExactRange || max(1, calendarDays(from: dates.start, to: dates.end)) != max(1, trip.nights) else { return "" }
        return "Migracja z iOS: dateRange=\(trip.dateRange); nights=\(trip.nights)"
    }

    private static func travelItineraryNote(_ item: TravelItineraryItem) -> String {
        let legacyDay = isLocalDate(item.day) ? nil : "Dzień z iOS: \(item.day)"
        return [item.detail, legacyDay].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private static func isLocalDate(_ value: String) -> Bool {
        let parts = value.split(separator: "-")
        return parts.count == 3
            && parts[0].count == 4
            && parts[1].count == 2
            && parts[2].count == 2
            && parts.allSatisfy { Int($0) != nil }
    }

    private static func calendarDays(from start: String, to end: String) -> Int {
        let parse: (String) -> Date? = { value in
            let parts = value.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
        }
        guard let first = parse(start), let last = parse(end) else { return 1 }
        return max(1, Calendar.current.dateComponents([.day], from: first, to: last).day ?? 1)
    }

    private static func canonicalUpdatedAt(_ goals: [CanonicalGoal]) -> String {
        goals.map(\.updatedAt).max() ?? RootineDate.isoTimestamp()
    }

    private static func canonicalSportUpdatedAt(_ workspace: CanonicalSportWorkspace) -> String {
        let timestamps = (workspace.scheduledWorkouts ?? []).map(\.updatedAt)
            + workspace.cycles.compactMap { try? decode(CanonicalSportCycle.self, from: $0) }.map(\.updatedAt)
            + workspace.workoutOutcomes.values.map(\.updatedAt)
        return timestamps.max() ?? RootineDate.isoTimestamp()
    }

    private static func goalCurrentValue(_ goal: CanonicalGoal) -> Double {
        if goal.progressMode == "milestones" {
            return goal.milestones.filter(\.done).reduce(0) { $0 + $1.weight }
        }
        if goal.progressMode == "manual", goal.progressEntries.isEmpty {
            return goal.manualProgress
        }
        return goal.progressEntries
            .sorted { "\($0.date)-\($0.createdAt)" < "\($1.date)-\($1.createdAt)" }
            .reduce(goal.initialValue) { current, entry in
                entry.kind == "absolute" ? entry.value : current + entry.value
            }
    }

    private static func cycleWorkoutDate(cycle: CanonicalSportCycle, week: Int, day: Int) -> String {
        let offset = max(0, week - 1) * 7 + min(6, max(0, day))
        guard let date = date(from: cycle.startDate), let shifted = Calendar.current.date(byAdding: .day, value: offset, to: date) else {
            return validDate(cycle.startDate)
        }
        return RootineDate.localDate(shifted)
    }

    private static func date(from value: String) -> Date? {
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private static func canonicalCycles(for workouts: [CanonicalSportScheduled], updatedAt: String) throws -> [JSONValue] {
        guard let firstDate = workouts.map(\.date).min(), let first = date(from: firstDate) else { return [] }
        let firstMonday = monday(for: first)
        let grouped = Dictionary(grouping: workouts) { workout in
            guard let date = date(from: workout.date) else { return 0 }
            let days = Calendar.current.dateComponents([.day], from: firstMonday, to: date).day ?? 0
            return max(0, days / (52 * 7))
        }
        return try grouped.keys.sorted().map { groupIndex in
            let cycleStart = Calendar.current.date(byAdding: .day, value: groupIndex * 52 * 7, to: firstMonday) ?? firstMonday
            let cycleWorkouts = (grouped[groupIndex] ?? []).sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }.compactMap { workout -> CanonicalSportCycleWorkout? in
                guard let date = date(from: workout.date) else { return nil }
                let offset = Calendar.current.dateComponents([.day], from: cycleStart, to: date).day ?? 0
                return CanonicalSportCycleWorkout(
                    id: workout.id,
                    week: min(52, max(1, offset / 7 + 1)),
                    day: min(6, max(0, offset % 7)),
                    title: workout.name,
                    discipline: workout.sportCategory,
                    durationMinutes: workout.plannedDuration
                )
            }
            let endDate = cycleWorkouts.compactMap { workout in
                cycleWorkoutDate(cycle: CanonicalSportCycle(id: "", name: "", startDate: RootineDate.localDate(cycleStart), weeks: 52, endDate: nil, repeatWeekly: false, workouts: [], updatedAt: updatedAt), week: workout.week, day: workout.day)
            }.max() ?? RootineDate.localDate(cycleStart)
            return try jsonValue(CanonicalSportCycle(
                id: groupIndex == 0 ? "native-ios-cycle" : "native-ios-cycle-\(groupIndex + 1)",
                name: "Treningi z iOS",
                startDate: RootineDate.localDate(cycleStart),
                weeks: max(1, cycleWorkouts.map(\.week).max() ?? 1),
                endDate: endDate,
                repeatWeekly: false,
                workouts: cycleWorkouts,
                updatedAt: updatedAt
            ))
        }
    }

    private static func monday(for date: Date) -> Date {
        let weekday = Calendar.current.component(.weekday, from: date)
        let offset = weekday == 1 ? -6 : 2 - weekday
        return Calendar.current.date(byAdding: .day, value: offset, to: date) ?? date
    }
}

private enum MappingError: Error {
    case invalidObject
}

private struct CanonicalSportWorkspace: Codable {
    var version: Int
    var storageSchemaVersion: Int
    var templates: [JSONValue]
    var activeCycle: JSONValue?
    var cycles: [JSONValue]
    var activeCycleId: String?
    var history: [CanonicalSportHistory]
    var sessions: [CanonicalSportSession]
    var workoutOutcomes: [String: CanonicalSportOutcome]
    var exercises: [JSONValue]?
    var scheduledWorkouts: [CanonicalSportScheduled]?
    var executions: [JSONValue]?
}

private struct CanonicalSportHistory: Codable {
    var id: String
    var title: String
    var discipline: String
    var date: String
    var plannedDurationMinutes: Int?
    var durationMinutes: Int
    var status: String
}

private struct CanonicalSportSession: Codable {
    var id: String
    var cycleWorkoutId: String?
    var title: String
    var discipline: String
    var date: String
    var plannedDurationMinutes: Int?
    var durationMinutes: Int
    var status: String
    var exercises: [JSONValue]
}

private struct CanonicalSportOutcome: Codable {
    var status: String
    var sessionId: String?
    var updatedAt: String
}

private struct CanonicalSportScheduled: Codable {
    var id: String
    var planId: String
    var date: String
    var name: String
    var sportCategory: String
    var plannedDuration: Int
    var status: String
    var contentSnapshot: [JSONValue]
    var notes: String?
    var createdAt: String
    var updatedAt: String
}

private struct CanonicalSportCycle: Codable {
    var id: String
    var name: String
    var startDate: String
    var weeks: Int
    var endDate: String?
    var repeatWeekly: Bool
    var workouts: [CanonicalSportCycleWorkout]
    var updatedAt: String
}

private struct CanonicalSportCycleWorkout: Codable {
    var id: String
    var week: Int
    var day: Int
    var title: String
    var discipline: String
    var durationMinutes: Int
}

private struct CanonicalGoalsWorkspace: Codable {
    var version: Int
    var goals: [CanonicalGoal]
    var categories: [CanonicalGoalCategory]
}

private struct CanonicalGoalCategory: Codable {
    var id: String
    var label: String
    var color: String
    var iconKey: String
}

private struct CanonicalGoal: Codable {
    var id: String
    var title: String
    var description: String
    var categoryId: String
    var iconKey: String
    var color: String
    var status: String
    var health: String
    var priority: String
    var startDate: String
    var dueDate: String
    var progressMode: String
    var regularityMode: String?
    var frequencyTarget: Double?
    var frequencyPeriod: String?
    var initialValue: Double
    var targetValue: Double
    var unit: String
    var manualProgress: Double
    var milestones: [CanonicalGoalMilestone]
    var progressEntries: [CanonicalGoalProgress]
    var note: String
    var createdAt: String
    var updatedAt: String
}

private struct CanonicalGoalProgress: Codable {
    var id: String
    var date: String
    var value: Double
    var kind: String
    var note: String
    var createdAt: String
}

private struct CanonicalGoalMilestone: Codable {
    var id: String
    var title: String
    var dueDate: String
    var done: Bool
    var weight: Double
}

private struct CanonicalWorkWorkspace: Codable {
    var version: Int
    var updatedAt: String
    var companies: [JSONValue]
    var projects: [JSONValue]
    var tasks: [JSONValue]
    var activeFocusStartedAt: String?
    var focusSessions: [WorkFocusSession]?
}

private struct CanonicalTravelWorkspace: Codable {
    var version: Int
    var updatedAt: String
    var trips: [CanonicalTravelTrip]
}

private struct CanonicalTravelTrip: Codable {
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
    var stays: [JSONValue]
    var transports: [JSONValue]
    var itinerary: [CanonicalTravelItinerary]
    var budget: [JSONValue]
    var documents: [JSONValue]
    var tasks: [JSONValue]
}

private struct CanonicalTravelItinerary: Codable {
    var id: String
    var date: String
    var time: String
    var title: String
    var location: String
    var kind: String
    var note: String
    var reserved: Bool
}

private struct CanonicalHealthWorkspace: Codable {
    var version: Int
    var entries: [CanonicalHealthEntry]
    var updatedAt: String
    var checkIns: [String: HealthCheckIn]?
    var reminders: [HealthReminder]?
}

private struct CanonicalHealthEntry: Codable {
    var id: String
    var title: String
    var kind: String
    var dueDate: String
    var time: String
    var location: String
    var note: String
    var status: String
    var createdAt: String
}
