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
        case .notes: return .notesCanonicalShadow
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

    // MARK: Notes

    /// Notes use the shared v1 document directly (unlike the compact More
    /// modules), but the native model intentionally does not know every field
    /// the web editor may add. Keep this mapping at the sync boundary so a
    /// native edit is local-first without turning an opaque web field into a
    /// deletion.
    static func payload(for workspace: NotesWorkspace) throws -> JSONValue {
        try jsonValue(workspace)
    }

    static func notesWorkspace(from payload: JSONValue) throws -> NotesWorkspace {
        try decode(NotesWorkspace.self, from: payload)
    }

    static func mergedNotesPayload(for workspace: NotesWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        let projected = try objectValue(payload(for: workspace))
        root["version"] = projected["version"] ?? .number(1)
        root["updatedAt"] = projected["updatedAt"] ?? .string(workspace.updatedAt)
        root["lists"] = mergedNotesLists(existing: root["lists"], projected: projected["lists"])
        root["notes"] = mergedNotesNotes(existing: root["notes"], projected: projected["notes"])
        return .object(root)
    }

    private static func mergedNotesLists(existing: JSONValue?, projected: JSONValue?) -> JSONValue {
        mergedNotesRecords(
            existing: existing,
            projected: projected,
            controlledKeys: ["id", "name", "createdAt"]
        )
    }

    private static func mergedNotesNotes(existing: JSONValue?, projected: JSONValue?) -> JSONValue {
        let projectedRecords = deduplicatedRecords(arrayValue(projected))
        let projectedByID = lastValueByKey(projectedRecords.compactMap { value -> (String, JSONValue)? in
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else { return nil }
            return (id, value)
        })
        var used = Set<String>()
        var records: [JSONValue] = []
        for value in deduplicatedRecords(arrayValue(existing)) {
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else {
                records.append(value)
                continue
            }
            guard let replacement = projectedByID[id] else { continue }
            records.append(mergeNoteRecord(existing: value, replacement: replacement))
            used.insert(id)
        }
        records.append(contentsOf: projectedRecords.filter { value in
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else { return true }
            return !used.contains(id)
        })
        return .array(records)
    }

    private static func mergedNotesRecords(existing: JSONValue?, projected: JSONValue?, controlledKeys: [String]) -> JSONValue {
        let projectedRecords = deduplicatedRecords(arrayValue(projected))
        let projectedByID = lastValueByKey(projectedRecords.compactMap { value -> (String, JSONValue)? in
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else { return nil }
            return (id, value)
        })
        var used = Set<String>()
        var records: [JSONValue] = []
        for value in deduplicatedRecords(arrayValue(existing)) {
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else {
                records.append(value)
                continue
            }
            guard let replacement = projectedByID[id] else { continue }
            records.append(mergeObjectFields(existing: value, replacement: replacement, keys: controlledKeys))
            used.insert(id)
        }
        records.append(contentsOf: projectedRecords.filter { value in
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else { return true }
            return !used.contains(id)
        })
        return .array(records)
    }

    private static func mergeNoteRecord(existing: JSONValue, replacement: JSONValue) -> JSONValue {
        let keys = ["id", "title", "body", "kind", "tags", "listId", "color", "pinned", "archived", "createdAt", "updatedAt"]
        let merged = mergeObjectFields(existing: existing, replacement: replacement, keys: keys)
        guard var object = objectValueIfPresent(merged),
              let replacementObject = objectValueIfPresent(replacement) else { return merged }
        guard let replacementItems = replacementObject["items"] else { return merged }
        object["items"] = mergedNotesItems(existing: object["items"], projected: replacementItems)
        return .object(object)
    }

    private static func mergedNotesItems(existing: JSONValue?, projected: JSONValue) -> JSONValue {
        let projectedItems = deduplicatedRecords(arrayValue(projected))
        let projectedByID = lastValueByKey(projectedItems.compactMap { value -> (String, JSONValue)? in
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else { return nil }
            return (id, value)
        })
        var used = Set<String>()
        var items: [JSONValue] = []
        for value in deduplicatedRecords(arrayValue(existing)) {
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else {
                items.append(value)
                continue
            }
            guard let replacement = projectedByID[id] else { continue }
            items.append(mergeObjectFields(existing: value, replacement: replacement, keys: ["id", "text", "checked"]))
            used.insert(id)
        }
        items.append(contentsOf: projectedItems.filter { value in
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else { return true }
            return !used.contains(id)
        })
        return .array(items)
    }

    static func payload(for workspace: SportWorkspace) throws -> JSONValue {
        let workouts = deduplicatedSportWorkouts(workspace.workouts)
        let history = workouts.filter(\.completed).map { workout in
            CanonicalSportHistory(
                id: workout.id,
                title: workout.title,
                discipline: discipline(for: workout.kind),
                date: validDate(workout.date),
                plannedDurationMinutes: max(1, workout.minutes),
                durationMinutes: max(1, workout.minutes),
                status: "completed",
                updatedAt: workout.updatedAt ?? workspace.updatedAt
            )
        }
        let scheduled = workouts.filter { !$0.completed }.map { workout in
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
                updatedAt: workout.updatedAt ?? workout.createdAt
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
                exercises: [],
                updatedAt: item.updatedAt ?? workspace.updatedAt
            )
        }
        let outcomes = lastValueByKey(history.map { item in
            (item.id, CanonicalSportOutcome(status: "completed", sessionId: item.id, updatedAt: item.updatedAt ?? workspace.updatedAt))
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
        let sessionWorkoutIDs = lastValueByKey(canonical.sessions.map { ($0.id, normalizedIdentifier($0.cycleWorkoutId ?? $0.id)) })
        var workouts: [SportWorkout] = []
        var seen = Set<String>()
        for item in canonical.history {
            let historyID = normalizedIdentifier(item.id)
            let workoutID = sessionWorkoutIDs[historyID] ?? historyID
            guard !workoutID.isEmpty, seen.insert(workoutID).inserted else { continue }
            workouts.append(SportWorkout(
                id: workoutID,
                title: item.title,
                date: item.date,
                minutes: max(1, item.durationMinutes, item.plannedDurationMinutes ?? 1),
                kind: kind(for: item.discipline),
                completed: item.status == "completed",
                createdAt: canonicalSportUpdatedAt(canonical),
                updatedAt: item.updatedAt
            ))
        }
        for item in canonical.scheduledWorkouts ?? [] {
            let normalizedID = normalizedIdentifier(item.id)
            guard !normalizedID.isEmpty, seen.insert(normalizedID).inserted else { continue }
            workouts.append(SportWorkout(
                id: normalizedID,
                title: item.name,
                date: item.date,
                minutes: max(1, item.plannedDuration),
                kind: kind(for: item.sportCategory),
                completed: item.status == "completed",
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            ))
        }
        for item in canonical.sessions {
            let workoutID = normalizedIdentifier(item.cycleWorkoutId ?? item.id)
            guard !workoutID.isEmpty, seen.insert(workoutID).inserted else { continue }
            workouts.append(SportWorkout(
                id: workoutID,
                title: item.title,
                date: item.date,
                minutes: max(1, item.durationMinutes, item.plannedDurationMinutes ?? 1),
                kind: kind(for: item.discipline),
                completed: item.status == "completed",
                createdAt: canonicalSportUpdatedAt(canonical),
                updatedAt: item.updatedAt
            ))
        }
        for cycleValue in canonical.cycles {
            guard let cycle = try? decode(CanonicalSportCycle.self, from: cycleValue) else { continue }
            for item in cycle.workouts where !item.id.isEmpty {
                let normalizedID = normalizedIdentifier(item.id)
                guard !normalizedID.isEmpty, seen.insert(normalizedID).inserted else { continue }
                workouts.append(SportWorkout(
                    id: normalizedID,
                    title: item.title,
                    date: cycleWorkoutDate(cycle: cycle, week: item.week, day: item.day),
                    minutes: max(1, item.durationMinutes),
                    kind: kind(for: item.discipline),
                    completed: false,
                    createdAt: cycle.updatedAt,
                    updatedAt: cycle.updatedAt
                ))
            }
        }
        return SportWorkspace(version: 1, updatedAt: canonicalSportUpdatedAt(canonical), workouts: workouts)
    }

    static func mergedSportPayload(for workspace: SportWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        // Canonical cycles are untrusted remote data too. Normalize the root
        // list before looking up the active cycle so duplicate/whitespace IDs
        // cannot survive a native merge or select an arbitrary duplicate.
        root["cycles"] = .array(deduplicatedSportCycles(arrayValue(root["cycles"])))
        let projectedPayload = try payload(for: workspace)
        let projected = try objectValue(projectedPayload)
        let canonical = try decode(CanonicalSportWorkspace.self, from: base)
        let nativeIDs = Set(deduplicatedSportWorkouts(workspace.workouts).map { normalizedIdentifier($0.id) })
        let originalNativeIDs = Set((try? sportWorkspace(from: base))?.workouts.map { normalizedIdentifier($0.id) } ?? [])
        let sessionIDsByWorkoutID: [String: String] = lastValueByKey(canonical.sessions.compactMap { session in
            guard let workoutID = session.cycleWorkoutId else { return nil }
            return (normalizedIdentifier(workoutID), normalizedIdentifier(session.id))
        })
        let managedWorkoutIDs = originalNativeIDs.union(nativeIDs)
        let managedRecordIDs = managedWorkoutIDs.union(sessionIDsByWorkoutID.values)
        let workoutIDBySessionID: [String: String] = lastValueByKey(canonical.sessions.compactMap { session in
            guard let workoutID = session.cycleWorkoutId else { return nil }
            return (normalizedIdentifier(session.id), normalizedIdentifier(workoutID))
        })
        let preservedHistoryIDs = Set(canonical.history.filter { $0.status != "completed" && nativeIDs.contains(workoutIDBySessionID[normalizedIdentifier($0.id)] ?? normalizedIdentifier($0.id)) }.map { normalizedIdentifier($0.id) }).intersection(managedRecordIDs)
        let preservedSessionIDs = Set(canonical.sessions.filter { $0.status != "completed" && nativeIDs.contains(workoutIDBySessionID[normalizedIdentifier($0.id)] ?? normalizedIdentifier($0.id)) }.map { normalizedIdentifier($0.id) }).intersection(managedRecordIDs)
        let preservedWorkoutIDs = Set(preservedHistoryIDs.union(preservedSessionIDs).map { workoutIDBySessionID[$0] ?? $0 }).intersection(nativeIDs)
        let projectedHistory = remappedRecordIDs(projected["history"], using: sessionIDsByWorkoutID)
        let projectedSessions = remappedRecordIDs(projected["sessions"], using: sessionIDsByWorkoutID)
        root["history"] = mergedSportRecords(existing: root["history"], projected: projectedHistory, managedIDs: managedRecordIDs, preservedIDs: preservedHistoryIDs, controlledKeys: ["id", "title", "discipline", "date", "plannedDurationMinutes", "durationMinutes", "status", "updatedAt"])
        root["sessions"] = mergedSportRecords(existing: root["sessions"], projected: projectedSessions, managedIDs: managedRecordIDs, preservedIDs: preservedSessionIDs, controlledKeys: ["id", "title", "discipline", "date", "plannedDurationMinutes", "durationMinutes", "status", "updatedAt"])
        root["scheduledWorkouts"] = mergedSportRecords(existing: root["scheduledWorkouts"], projected: projected["scheduledWorkouts"], managedIDs: managedWorkoutIDs, preservedIDs: [], controlledKeys: ["id", "date", "name", "sportCategory", "plannedDuration"])
        var outcomes = normalizedObjectByIdentifier(objectValueIfPresent(root["workoutOutcomes"]) ?? [:])
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

        let existingCycleWorkoutIDs = Set(canonical.cycles.flatMap { cycleValue in
            (try? decode(CanonicalSportCycle.self, from: cycleValue))?.workouts.map { normalizedIdentifier($0.id) } ?? []
        })
        let allExistingIDs = Set(canonical.history.map { normalizedIdentifier($0.id) })
            .union(canonical.sessions.map { normalizedIdentifier($0.id) })
            .union((canonical.scheduledWorkouts ?? []).map { normalizedIdentifier($0.id) })
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
            let projectedCycleID = identifier(objectValueIfPresent(projectedCycle)?["id"])
            var cycles = arrayValue(root["cycles"])
            if let cycleIndex = cycles.firstIndex(where: { identifier(objectValueIfPresent($0)?["id"]) == projectedCycleID }), projectedCycleID == "native-ios-cycle" {
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
        let categories = deduplicatedGoalCategories(workspace.categories.isEmpty
            ? [CanonicalGoalCategory(id: "personal", label: "Sprawy osobiste", color: "#8793A1", iconKey: "circle")]
            : workspace.categories.map { CanonicalGoalCategory(id: $0.id, label: $0.label, color: $0.color, iconKey: $0.iconKey) })
        let goals = deduplicatedGoals(workspace.goals).map { goal in
            return CanonicalGoal(
                id: goal.id,
                title: goal.title,
                description: goal.detail,
                categoryId: categories.contains(where: { $0.id == goal.categoryId }) ? goal.categoryId : "personal",
                iconKey: goal.iconKey.isEmpty ? goalIcon(for: goal.icon) : goal.iconKey,
                customIcon: goal.customIcon,
                color: goal.color,
                status: goal.status.rawValue,
                health: goal.health.rawValue,
                priority: goal.priority.rawValue,
                startDate: validDate(goal.startDate),
                dueDate: maxDate(validDate(goal.startDate), validDate(goal.dueDate)),
                progressMode: goal.progressMode.rawValue,
                regularityMode: goal.regularityMode?.rawValue,
                frequencyTarget: goal.frequencyTarget,
                frequencyPeriod: goal.frequencyPeriod?.rawValue,
                initialValue: goal.initialValue,
                targetValue: max(0, goal.targetValue > 0 ? goal.targetValue : goal.target),
                unit: goal.progressMode == .milestones ? "etapów" : goal.unit,
                manualProgress: goal.manualProgress,
                milestones: goal.milestones.map { milestone in
                    CanonicalGoalMilestone(
                        id: milestone.id,
                        title: milestone.title,
                        note: milestone.note,
                        dueDate: validDate(milestone.dueDate),
                        done: milestone.done,
                        completedAt: milestone.completedAt,
                        weight: max(0.01, milestone.weight),
                        order: milestone.order,
                        isNext: milestone.isNext,
                        linkedTaskIds: milestone.linkedTaskIds
                    )
                },
                progressEntries: goal.progressEntries.map { entry in
                    CanonicalGoalProgress(id: entry.id, date: validDate(entry.date), value: entry.value, kind: entry.kind.rawValue, note: entry.note, createdAt: entry.createdAt)
                },
                linkedTaskIds: goal.linkedTaskIds,
                history: goal.history.map { entry in
                    CanonicalGoalHistory(id: entry.id, type: entry.type.rawValue, label: entry.label, detail: entry.detail, createdAt: entry.createdAt)
                },
                note: goal.note,
                createdAt: goal.createdAt,
                updatedAt: goal.updatedAt
            )
        }
        return try jsonValue(CanonicalGoalsWorkspace(version: 1, goals: goals, categories: categories))
    }

    static func goalsWorkspace(from payload: JSONValue) throws -> GoalsWorkspace {
        let canonical = try decode(CanonicalGoalsWorkspace.self, from: payload)
        let goals = canonical.goals.map { goal in
            return GoalRecord(
                id: goal.id,
                title: goal.title,
                detail: goal.description,
                current: max(0, goalCurrentValue(goal)),
                target: max(1, goal.targetValue),
                icon: nativeIcon(for: goal.iconKey),
                createdAt: goal.createdAt,
                updatedAt: goal.updatedAt,
                categoryId: goal.categoryId,
                iconKey: goal.iconKey,
                customIcon: goal.customIcon,
                color: goal.color,
                status: GoalStatus(rawValue: goal.status) ?? .active,
                health: GoalHealth(rawValue: goal.health) ?? .ontrack,
                priority: GoalPriority(rawValue: goal.priority) ?? .medium,
                startDate: goal.startDate,
                dueDate: goal.dueDate,
                progressMode: GoalProgressMode(rawValue: goal.progressMode) ?? .numeric,
                regularityMode: goal.regularityMode.flatMap(GoalRegularityMode.init(rawValue:)),
                frequencyTarget: goal.frequencyTarget,
                frequencyPeriod: goal.frequencyPeriod.flatMap(GoalRegularityPeriod.init(rawValue:)),
                initialValue: goal.initialValue,
                targetValue: goal.targetValue,
                unit: goal.unit,
                manualProgress: goal.manualProgress,
                milestones: goal.milestones.map { milestone in
                    GoalMilestone(id: milestone.id, title: milestone.title, note: milestone.note ?? "", dueDate: milestone.dueDate, done: milestone.done, completedAt: milestone.completedAt, weight: milestone.weight, order: milestone.order, isNext: milestone.isNext, linkedTaskIds: milestone.linkedTaskIds ?? [])
                },
                progressEntries: goal.progressEntries.map { entry in
                    GoalProgressEntry(id: entry.id, date: entry.date, value: entry.value, kind: GoalProgressEntry.Kind(rawValue: entry.kind) ?? .absolute, note: entry.note, createdAt: entry.createdAt)
                },
                linkedTaskIds: goal.linkedTaskIds ?? [],
                history: goal.history?.map { entry in
                    GoalHistoryEntry(id: entry.id, type: GoalHistoryEntry.EntryType(rawValue: entry.type ?? "updated") ?? .updated, label: entry.label, detail: entry.detail, createdAt: entry.createdAt)
                } ?? [],
                note: goal.note
            )
        }
        let categories = canonical.categories.map { GoalCategory(id: $0.id, label: $0.label, color: $0.color, iconKey: $0.iconKey) }
        return GoalsWorkspace(version: 1, updatedAt: canonicalUpdatedAt(canonical.goals), goals: deduplicatedGoals(goals), categories: categories)
    }

    static func mergedGoalsPayload(for workspace: GoalsWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        let projectedPayload = try payload(for: workspace)
        let projected = try objectValue(projectedPayload)
        let nativeGoals = dictionaryByID(projected["goals"])
        let canonicalGoals = deduplicatedRecords(arrayValue(root["goals"]))
        var existingIDs = Set<String>()
        let mergedGoals = canonicalGoals.compactMap { value -> JSONValue? in
            guard var goal = objectValueIfPresent(value), let id = identifier(goal["id"]), let native = nativeGoals[id] else {
                // Native projection contains every canonical goal. Missing
                // ids therefore represent an intentional native deletion.
                return nil
            }
            existingIDs.insert(id)
            for key in [
                "title", "description", "categoryId", "iconKey", "customIcon", "color", "status", "health", "priority",
                "startDate", "dueDate", "progressMode", "regularityMode", "frequencyTarget", "frequencyPeriod",
                "initialValue", "targetValue", "unit", "manualProgress", "milestones", "progressEntries", "linkedTaskIds",
                "history", "note", "createdAt", "updatedAt"
            ] {
                if let replacement = native[key] { goal[key] = replacement }
            }
            return .object(goal)
        }
        var allGoals = mergedGoals
        if let projectedGoalValues = projected["goals"], case .array(let values) = projectedGoalValues {
            allGoals.append(contentsOf: deduplicatedRecords(values).filter { value in
                guard let id = identifier(objectValueIfPresent(value)?["id"]) else { return false }
                return !existingIDs.contains(id)
            })
        }
        root["goals"] = .array(allGoals)
        if let categories = projected["categories"] { root["categories"] = categories }
        return .object(root)
    }

    static func payload(for workspace: WorkWorkspace) throws -> JSONValue {
        let sanitized = rootineSanitizedWorkWorkspace(workspace)
        return try jsonValue(CanonicalWorkWorkspace(
            version: 3,
            updatedAt: sanitized.updatedAt,
            companies: try sanitized.companies.map { try jsonValue($0) },
            projects: try sanitized.projects.map { try jsonValue($0) },
            tasks: try sanitized.tasks.map { try jsonValue($0) },
            activeFocusStartedAt: sanitized.activeFocusStartedAt,
            activeFocusProjectID: sanitized.activeFocusProjectID,
            activeFocusTaskID: sanitized.activeFocusTaskID,
            pausedFocusSessionID: sanitized.pausedFocusSessionID,
            focusSessions: try deduplicatedWorkFocusSessions(sanitized.focusSessions).map { try jsonValue($0) }
        ))
    }

    static func workWorkspace(from payload: JSONValue) throws -> WorkWorkspace {
        let canonical = try decode(CanonicalWorkWorkspace.self, from: payload)
        let companies = canonical.companies.compactMap { try? decode(WorkCompany.self, from: $0) }
        let projects = canonical.projects.compactMap { try? decode(WorkProject.self, from: $0) }
        let tasks = canonical.tasks.compactMap { try? decode(WorkItem.self, from: $0) }
        let sessions = (canonical.focusSessions ?? []).compactMap { try? decode(WorkFocusSession.self, from: $0) }
        return WorkWorkspace(
            version: 1,
            updatedAt: canonical.updatedAt,
            activeFocusStartedAt: canonical.activeFocusStartedAt,
            pausedFocusSessionID: canonical.pausedFocusSessionID,
            activeFocusProjectID: canonical.activeFocusProjectID,
            activeFocusTaskID: canonical.activeFocusTaskID,
            focusSessions: deduplicatedWorkFocusSessions(sessions),
            companies: companies,
            projects: projects,
            tasks: tasks,
            hasFullProjection: true
        )
    }

    static func mergedWorkPayload(for workspace: WorkWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        let sanitized = rootineSanitizedWorkWorkspace(workspace)
        root["updatedAt"] = .string(sanitized.updatedAt)
        if let activeFocusStartedAt = sanitized.activeFocusStartedAt {
            root["activeFocusStartedAt"] = .string(activeFocusStartedAt)
        } else {
            root.removeValue(forKey: "activeFocusStartedAt")
        }
        if sanitized.hasFullProjection {
            if let activeFocusProjectID = sanitized.activeFocusProjectID {
                root["activeFocusProjectID"] = .string(activeFocusProjectID)
            } else {
                root.removeValue(forKey: "activeFocusProjectID")
            }
            if let activeFocusTaskID = sanitized.activeFocusTaskID {
                root["activeFocusTaskID"] = .string(activeFocusTaskID)
            } else {
                root.removeValue(forKey: "activeFocusTaskID")
            }
            if let pausedFocusSessionID = sanitized.pausedFocusSessionID {
                root["pausedFocusSessionID"] = .string(pausedFocusSessionID)
            } else {
                root.removeValue(forKey: "pausedFocusSessionID")
            }
            root["companies"] = try mergedWorkRecords(
                native: sanitized.companies.map { try jsonValue($0) },
                base: arrayValue(root["companies"])
            )
            root["projects"] = try mergedWorkRecords(
                native: sanitized.projects.map { try jsonValue($0) },
                base: arrayValue(root["projects"])
            )
            root["tasks"] = try mergedWorkRecords(
                native: sanitized.tasks.map { try jsonValue($0) },
                base: arrayValue(root["tasks"])
            )
            root["focusSessions"] = try mergedWorkRecords(
                native: sanitized.focusSessions.map { try jsonValue($0) },
                base: arrayValue(root["focusSessions"])
            )
        } else if !sanitized.focusSessions.isEmpty || root["focusSessions"] != nil || sanitized.pausedFocusSessionID != nil || sanitized.activeFocusProjectID != nil || sanitized.activeFocusTaskID != nil {
            // Compact v1 local snapshots only own the focus projection. Keep
            // all server-owned Work collections untouched during their first
            // post-upgrade write.
            if !sanitized.focusSessions.isEmpty {
                root["focusSessions"] = try jsonValue(deduplicatedWorkFocusSessions(sanitized.focusSessions))
            }
            if let pausedFocusSessionID = sanitized.pausedFocusSessionID {
                root["pausedFocusSessionID"] = .string(pausedFocusSessionID)
            }
            if let activeFocusProjectID = sanitized.activeFocusProjectID {
                root["activeFocusProjectID"] = .string(activeFocusProjectID)
            }
            if let activeFocusTaskID = sanitized.activeFocusTaskID {
                root["activeFocusTaskID"] = .string(activeFocusTaskID)
            }
        }
        return .object(root)
    }

    static func payload(for workspace: TravelWorkspace) throws -> JSONValue {
        let trips = try deduplicatedTravelTrips(workspace.trips).map { trip -> CanonicalTravelTrip in
            let dates = travelDates(trip, createdAt: trip.createdAt)
            return CanonicalTravelTrip(
                id: trip.id,
                name: trip.name.isEmpty ? trip.destination : trip.name,
                destination: trip.destination,
                startDate: dates.start,
                endDate: dates.end,
                status: trip.status,
                travelers: trip.travelers,
                baseCurrency: trip.baseCurrency.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(),
                note: trip.note.isEmpty ? travelMigrationNote(trip, dates: dates) : trip.note,
                archivedAt: trip.archivedAt,
                stays: try jsonArray(trip.stays),
                transports: try jsonArray(trip.transports),
                bookings: try jsonArray(trip.bookings),
                itinerary: deduplicatedTravelItinerary(trip.itinerary).map {
                    canonicalTravelItinerary($0, fallbackDate: dates.start)
                },
                budget: try jsonArray(trip.budget),
                documents: try jsonArray(trip.documents),
                tasks: try jsonArray(trip.tasks),
                packingItems: try jsonArray(trip.packingItems),
                timezone: trip.timezone
            )
        }
        return try jsonValue(CanonicalTravelWorkspace(version: 2, updatedAt: workspace.updatedAt, trips: trips))
    }

    static func travelWorkspace(from payload: JSONValue) throws -> TravelWorkspace {
        let canonical = try decode(CanonicalTravelWorkspace.self, from: payload)
        guard canonical.version == 2 else {
            throw RootineNormalizedReadError.materializationFailed("nieobsługiwana wersja podróży \(canonical.version)")
        }
        let trips = try canonical.trips.map { trip in
            return TravelRecord(
                id: trip.id,
                name: trip.name,
                destination: trip.destination,
                startDate: trip.startDate,
                endDate: trip.endDate,
                status: trip.status,
                travelers: trip.travelers,
                baseCurrency: trip.baseCurrency,
                note: trip.note,
                archivedAt: trip.archivedAt,
                stays: try decodeArray(TravelStay.self, from: trip.stays),
                transports: try decodeArray(TravelTransport.self, from: trip.transports),
                bookings: try decodeArray(TravelBooking.self, from: trip.bookings),
                itinerary: deduplicatedCanonicalTravelItinerary(trip.itinerary ?? []).map { item in
                    TravelItineraryItem(
                        id: item.id,
                        date: item.date,
                        time: item.time,
                        title: item.title,
                        location: item.location,
                        kind: item.kind,
                        note: item.note,
                        reserved: item.reserved,
                        startsAt: item.startsAt,
                        endsAt: item.endsAt,
                        timezone: item.timezone
                    )
                },
                budget: try decodeArray(TravelBudgetLine.self, from: trip.budget),
                documents: try decodeArray(TravelDocument.self, from: trip.documents),
                tasks: try decodeArray(TravelTask.self, from: trip.tasks),
                packingItems: try decodeArray(TravelPackingItem.self, from: trip.packingItems),
                timezone: trip.timezone,
                createdAt: canonical.updatedAt,
                updatedAt: canonical.updatedAt
            )
        }
        let workspace = TravelWorkspace(version: 1, updatedAt: canonical.updatedAt, trips: deduplicatedTravelTrips(trips))
        guard rootineValidateTravelWorkspace(workspace).isEmpty else {
            throw RootineNormalizedReadError.materializationFailed("nieprawidłowe dane podróży")
        }
        return workspace
    }

    static func mergedTravelPayload(for workspace: TravelWorkspace, onto base: JSONValue) throws -> JSONValue {
        var root = try objectValue(base)
        let projected = try objectValue(payload(for: workspace))
        let nativeTrips = dictionaryByID(projected["trips"])
        let originalNative = try? travelWorkspace(from: base)
        let trips = deduplicatedRecords(arrayValue(root["trips"])).compactMap { value -> JSONValue? in
            guard var trip = objectValueIfPresent(value), let id = identifier(trip["id"]), let native = nativeTrips[id] else {
                // Native projection contains every canonical trip; a missing
                // id is a native deletion, while nested web-only fields stay
                // untouched for trips that remain.
                return nil
            }
            let originalTrip = originalNative?.trips.first(where: { normalizedIdentifier($0.id) == id })
            for key in ["name", "destination", "startDate", "endDate", "status", "travelers", "baseCurrency", "note", "archivedAt"] {
                if key == "itinerary" { continue }
                if let replacement = native[key] { trip[key] = replacement }
            }
            if let existingItinerary = trip["itinerary"] {
                trip["itinerary"] = mergedTravelItinerary(
                    existing: existingItinerary,
                    native: workspace.trips.first(where: { normalizedIdentifier($0.id) == id })?.itinerary ?? [],
                    original: originalTrip?.itinerary ?? []
                )
            }
            if let originalTrip,
               let currentTrip = workspace.trips.first(where: { normalizedIdentifier($0.id) == id }) {
                if currentTrip.stays != originalTrip.stays { trip["stays"] = try? jsonValue(currentTrip.stays) }
                if currentTrip.transports != originalTrip.transports { trip["transports"] = try? jsonValue(currentTrip.transports) }
                if currentTrip.bookings != originalTrip.bookings { trip["bookings"] = try? jsonValue(currentTrip.bookings) }
                if currentTrip.budget != originalTrip.budget { trip["budget"] = try? jsonValue(currentTrip.budget) }
                if currentTrip.documents != originalTrip.documents { trip["documents"] = try? jsonValue(currentTrip.documents) }
                if currentTrip.tasks != originalTrip.tasks { trip["tasks"] = try? jsonValue(currentTrip.tasks) }
                if currentTrip.packingItems != originalTrip.packingItems { trip["packingItems"] = try? jsonValue(currentTrip.packingItems) }
                if currentTrip.timezone != originalTrip.timezone { trip["timezone"] = currentTrip.timezone.map(JSONValue.string) ?? .null }
            }
            return .object(trip)
        }
        let existingIDs = Set(trips.compactMap { identifier(objectValueIfPresent($0)?["id"]) })
        var allTrips = trips
        if case .array(let values) = projected["trips"] {
            allTrips.append(contentsOf: deduplicatedRecords(values).filter { !existingIDs.contains(identifier(objectValueIfPresent($0)?["id"]) ?? "") })
        }
        root["trips"] = .array(allTrips)
        root["updatedAt"] = .string(workspace.updatedAt)
        return .object(root)
    }

    static func payload(for workspace: HealthWorkspace) throws -> JSONValue {
        let sanitized = rootineSanitizedHealthWorkspace(workspace)
        return try jsonValue(CanonicalHealthWorkspace(
            version: 1,
            entries: [],
            updatedAt: sanitized.updatedAt,
            checkIns: sanitized.checkIns,
            reminders: deduplicatedHealthReminders(sanitized.reminders)
        ))
    }

    static func healthWorkspace(from payload: JSONValue) throws -> HealthWorkspace {
        let canonical = try decode(CanonicalHealthWorkspace.self, from: payload)
        return rootineSanitizedHealthWorkspace(HealthWorkspace(
            version: 1,
            updatedAt: canonical.updatedAt,
            checkIns: canonical.checkIns ?? [:],
            reminders: deduplicatedHealthReminders(canonical.reminders ?? [])
        ))
    }

    static func mergedHealthPayload(for workspace: HealthWorkspace, onto base: JSONValue) throws -> JSONValue {
        let sanitized = rootineSanitizedHealthWorkspace(workspace)
        var root = try objectValue(base)
        root["updatedAt"] = .string(sanitized.updatedAt)
        if !sanitized.checkIns.isEmpty || root["checkIns"] != nil {
            root["checkIns"] = try jsonValue(sanitized.checkIns)
        }
        if !sanitized.reminders.isEmpty || root["reminders"] != nil {
            // Health reminders have no web-only nested fields in the
            // contract. An empty native collection is therefore an explicit
            // deletion, not a signal to retain stale canonical rows.
            root["reminders"] = try jsonValue(deduplicatedHealthReminders(sanitized.reminders))
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

    /// IDs arrive from both native Codable payloads and the web canonical
    /// document. Treat surrounding whitespace as transport noise so malformed
    /// imports cannot create a second record for the same logical entity.
    private static func normalizedIdentifier(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func identifier(_ value: JSONValue?) -> String? {
        guard let value = stringValue(value) else { return nil }
        let normalized = normalizedIdentifier(value)
        return normalized.isEmpty ? nil : normalized
    }

    private static func dictionaryByID(_ value: JSONValue?) -> [String: [String: JSONValue]] {
        arrayValue(value).reduce(into: [:]) { result, item in
            guard let object = objectValueIfPresent(item), let id = identifier(object["id"]) else { return }
            result[id] = object
        }
    }

    /// Object maps (for example Sport outcomes) are also untrusted transport
    /// data. Normalizing keys in sorted order makes the winner deterministic
    /// when a remote document contains both `"id"` and `" id "`.
    private static func normalizedObjectByIdentifier(
        _ object: [String: JSONValue]
    ) -> [String: JSONValue] {
        object.keys.sorted().reduce(into: [:]) { result, rawKey in
            guard let key = identifier(.string(rawKey)), let value = object[rawKey] else { return }
            result[key] = value
        }
    }

    private static func deduplicatedSportCycles(_ cycles: [JSONValue]) -> [JSONValue] {
        deduplicatedRecords(cycles).map { cycle in
            guard var object = objectValueIfPresent(cycle) else { return cycle }
            if case .array(let workouts) = object["workouts"] {
                object["workouts"] = .array(deduplicatedRecords(workouts))
            }
            return .object(object)
        }
    }

    /// Keeps the final occurrence for duplicate IDs while preserving the
    /// order of the retained records. The unique-keys initializer traps on
    /// malformed backend payloads; a deterministic last-write-wins policy
    /// keeps reconciliation recoverable instead.
    private static func lastValueByKey<Value>(_ pairs: [(String, Value)]) -> [String: Value] {
        pairs.reduce(into: [String: Value]()) { result, pair in
            let key = normalizedIdentifier(pair.0)
            guard !key.isEmpty else { return }
            result[key] = pair.1
        }
    }

    private static func deduplicatedSportWorkouts(_ workouts: [SportWorkout]) -> [SportWorkout] {
        var seen = Set<String>()
        var retained: [SportWorkout] = []
        for workout in workouts.reversed() {
            let normalizedID = normalizedIdentifier(workout.id)
            guard !normalizedID.isEmpty,
                  seen.insert(normalizedID).inserted else { continue }
            var normalized = workout
            normalized.id = normalizedID
            retained.append(normalized)
        }
        return Array(retained.reversed())
    }

    private static func deduplicatedWorkFocusSessions(_ sessions: [WorkFocusSession]) -> [WorkFocusSession] {
        var seen = Set<String>()
        var retained: [WorkFocusSession] = []
        for session in sessions.reversed() {
            let normalizedID = normalizedIdentifier(session.id)
            guard !normalizedID.isEmpty,
                  seen.insert(normalizedID).inserted else { continue }
            var normalized = session
            normalized.id = normalizedID
            retained.append(normalized)
        }
        return Array(retained.reversed())
    }

    /// Merge a native collection into the last canonical shadow while
    /// retaining fields that iOS does not understand. Native records are the
    /// authoritative set for this projection, but each matching base object
    /// wins for unknown keys and the native values win for known keys.
    private static func mergedWorkRecords(native: [JSONValue], base: [JSONValue]) throws -> JSONValue {
        let normalizedNative = deduplicatedRecords(native)
        let normalizedBase = deduplicatedRecords(base)
        let baseByID = normalizedBase.reduce(into: [String: JSONValue]()) { result, value in
            guard let id = identifier(objectValueIfPresent(value)?["id"]) else { return }
            result[id] = value
        }
        let merged = normalizedNative.map { value -> JSONValue in
            guard let id = identifier(objectValueIfPresent(value)?["id"]),
                  let existing = baseByID[id],
                  let existingObject = objectValueIfPresent(existing),
                  let nativeObject = objectValueIfPresent(value) else { return value }
            return .object(existingObject.merging(nativeObject) { _, native in native })
        }
        return .array(merged)
    }

    private static func deduplicatedGoals(_ goals: [GoalRecord]) -> [GoalRecord] {
        var seen = Set<String>()
        var retained: [GoalRecord] = []
        for goal in goals.reversed() {
            let normalizedID = normalizedIdentifier(goal.id)
            guard !normalizedID.isEmpty,
                  seen.insert(normalizedID).inserted else { continue }
            var normalized = goal
            normalized.id = normalizedID
            retained.append(normalized)
        }
        return Array(retained.reversed())
    }

    private static func deduplicatedGoalCategories(_ categories: [CanonicalGoalCategory]) -> [CanonicalGoalCategory] {
        var seen = Set<String>()
        var retained: [CanonicalGoalCategory] = []
        for category in categories.reversed() {
            let normalizedID = normalizedIdentifier(category.id)
            guard !normalizedID.isEmpty, seen.insert(normalizedID).inserted else { continue }
            var normalized = category
            normalized.id = normalizedID
            retained.append(normalized)
        }
        return Array(retained.reversed())
    }

    private static func deduplicatedTravelTrips(_ trips: [TravelRecord]) -> [TravelRecord] {
        var seen = Set<String>()
        var retained: [TravelRecord] = []
        for trip in trips.reversed() {
            let normalizedID = normalizedIdentifier(trip.id)
            guard !normalizedID.isEmpty,
                  seen.insert(normalizedID).inserted else { continue }
            var normalized = trip
            normalized.id = normalizedID
            retained.append(normalized)
        }
        return Array(retained.reversed())
    }

    private static func deduplicatedTravelItinerary(_ items: [TravelItineraryItem]) -> [TravelItineraryItem] {
        var seen = Set<String>()
        var retained: [TravelItineraryItem] = []
        for item in items.reversed() {
            let normalizedID = normalizedIdentifier(item.id)
            guard !normalizedID.isEmpty, seen.insert(normalizedID).inserted else { continue }
            var normalized = item
            normalized.id = normalizedID
            retained.append(normalized)
        }
        return Array(retained.reversed())
    }

    private static func deduplicatedCanonicalTravelItinerary(
        _ items: [CanonicalTravelItinerary]
    ) -> [CanonicalTravelItinerary] {
        var seen = Set<String>()
        var retained: [CanonicalTravelItinerary] = []
        for item in items.reversed() {
            let normalizedID = normalizedIdentifier(item.id)
            guard !normalizedID.isEmpty, seen.insert(normalizedID).inserted else { continue }
            var normalized = item
            normalized.id = normalizedID
            retained.append(normalized)
        }
        return Array(retained.reversed())
    }

    private static func canonicalTravelItinerary(_ item: TravelItineraryItem, fallbackDate: String? = nil) -> CanonicalTravelItinerary {
        CanonicalTravelItinerary(
            id: normalizedIdentifier(item.id),
            date: validDate(item.date.isEmpty ? item.day : item.date, fallback: fallbackDate ?? "1970-01-01"),
            time: item.time,
            title: item.title,
            location: item.location,
            kind: item.kind,
            note: item.note.isEmpty ? travelItineraryNote(item) : item.note,
            reserved: item.reserved,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            timezone: item.timezone
        )
    }

    private static func deduplicatedHealthReminders(_ reminders: [HealthReminder]) -> [HealthReminder] {
        var seen = Set<String>()
        var retained: [HealthReminder] = []
        for reminder in reminders.reversed() {
            let normalizedID = normalizedIdentifier(reminder.id)
            guard !normalizedID.isEmpty,
                  seen.insert(normalizedID).inserted else { continue }
            var normalized = reminder
            normalized.id = normalizedID
            retained.append(normalized)
        }
        return Array(retained.reversed())
    }

    private static func deduplicatedRecords(_ records: [JSONValue]) -> [JSONValue] {
        var seen = Set<String>()
        var retained: [JSONValue] = []
        for record in records.reversed() {
            guard var object = objectValueIfPresent(record),
                  let rawID = stringValue(object["id"]) else {
                retained.append(record)
                continue
            }
            let id = normalizedIdentifier(rawID)
            guard !id.isEmpty, seen.insert(id).inserted else { continue }
            object["id"] = .string(id)
            retained.append(.object(object))
        }
        return Array(retained.reversed())
    }

    private static func remappedRecordIDs(_ value: JSONValue?, using mapping: [String: String]) -> JSONValue {
        .array(arrayValue(value).map { record in
            guard var object = objectValueIfPresent(record), let id = identifier(object["id"]), let mappedID = mapping[id] else { return record }
            object["id"] = .string(mappedID)
            return .object(object)
        })
    }

    private static func mergedNativeRecords(existing: JSONValue?, projected: JSONValue?, nativeIDs: Set<String>, controlledKeys: [String]) -> JSONValue {
        let projectedRecords = deduplicatedRecords(arrayValue(projected))
        let projectedByID = lastValueByKey(projectedRecords.compactMap { record -> (String, JSONValue)? in
            guard let id = identifier(objectValueIfPresent(record)?["id"]) else { return nil }
            return (id, record)
        })
        var usedIDs = Set<String>()
        var records: [JSONValue] = []
        for record in deduplicatedRecords(arrayValue(existing)) {
            guard let id = identifier(objectValueIfPresent(record)?["id"]), nativeIDs.contains(id) else {
                records.append(record)
                continue
            }
            if let replacement = projectedByID[id] {
                records.append(mergeObjectFields(existing: record, replacement: replacement, keys: controlledKeys))
                usedIDs.insert(id)
            }
        }
        records.append(contentsOf: projectedRecords.filter { record in
            guard let id = identifier(objectValueIfPresent(record)?["id"]) else { return true }
            return !usedIDs.contains(id)
        })
        return .array(records)
    }

    private static func mergedSportRecords(existing: JSONValue?, projected: JSONValue?, managedIDs: Set<String>, preservedIDs: Set<String>, controlledKeys: [String]) -> JSONValue {
        let projectedRecords = deduplicatedRecords(arrayValue(projected))
        let projectedByID = lastValueByKey(projectedRecords.compactMap { record -> (String, JSONValue)? in
            guard let id = identifier(objectValueIfPresent(record)?["id"]) else { return nil }
            return (id, record)
        })
        var usedIDs = Set<String>()
        var records: [JSONValue] = []
        for record in deduplicatedRecords(arrayValue(existing)) {
            guard let id = identifier(objectValueIfPresent(record)?["id"]) else {
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
            guard let id = identifier(objectValueIfPresent(record)?["id"]) else { return true }
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
        cycle["workouts"] = .array(deduplicatedRecords(workouts).filter { !ids.contains(identifier(objectValueIfPresent($0)?["id"]) ?? "") })
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
        let normalizedNative = deduplicatedTravelItinerary(native)
        let nativeByID = lastValueByKey(normalizedNative.compactMap { item -> (String, TravelItineraryItem)? in
            let id = normalizedIdentifier(item.id)
            return id.isEmpty ? nil : (id, item)
        })
        let originalByID = lastValueByKey(original.compactMap { item -> (String, TravelItineraryItem)? in
            let id = normalizedIdentifier(item.id)
            return id.isEmpty ? nil : (id, item)
        })
        var seenNativeIDs = Set<String>()
        var values: [JSONValue] = []
        for value in deduplicatedRecords(arrayValue(existing)) {
            guard var item = objectValueIfPresent(value), let id = identifier(item["id"]) else {
                values.append(value)
                continue
            }
            if let nativeItem = nativeByID[id] {
                // The native editor owns the fields it can change, while
                // web-only location/kind/reservation metadata stays intact
                // unless the native detail explicitly changed.
                let originalItem = originalByID[id]
                if originalItem == nil || nativeItem.day != originalItem?.day {
                    item["date"] = .string(validDate(nativeItem.day))
                }
                if originalItem == nil || nativeItem.title != originalItem?.title {
                    item["title"] = .string(nativeItem.title)
                }
                if originalItem == nil || nativeItem.detail != originalItem?.detail {
                    item["location"] = .string("")
                    item["note"] = .string(nativeItem.detail)
                }
                values.append(.object(item))
                seenNativeIDs.insert(id)
            } else if originalByID[id] == nil {
                // A record that existed only on the web remains untouched;
                // a native record missing from the current snapshot is an
                // intentional delete and must not be resurrected.
                values.append(value)
            }
        }

        // Preserve newly-created native itinerary entries even when the
        // canonical base had no matching row yet.
        for item in normalizedNative {
            let id = normalizedIdentifier(item.id)
            guard !id.isEmpty, !seenNativeIDs.contains(id) else { continue }
            if let encoded = try? jsonValue(canonicalTravelItinerary(item)) {
                values.append(encoded)
            }
        }
        return .array(values)
    }

    private static func updatedNumericProgressEntries(existing: JSONValue?, goalID: String, value: Double, updatedAt: String) -> JSONValue {
        let progressID = "ios-progress-\(normalizedIdentifier(goalID))"
        let entry: JSONValue = .object([
            "id": .string(progressID),
            "date": .string(validDate(String(updatedAt.prefix(10)))),
            "value": .number(value),
            "kind": .string("absolute"),
            "note": .string("Postęp z aplikacji iOS"),
            "createdAt": .string(updatedAt)
        ])
        var entries = arrayValue(existing)
        if let index = entries.firstIndex(where: { identifier(objectValueIfPresent($0)?["id"]) == progressID }) {
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

    private static func decodeArray<T: Decodable>(_ type: T.Type, from value: [JSONValue]?) throws -> [T] {
        try (value ?? []).map { try decode(type, from: $0) }
    }

    private static func jsonArray<T: Encodable>(_ value: T) throws -> [JSONValue] {
        guard case .array(let values) = try jsonValue(value) else { return [] }
        return values
    }

    private static func validDate(_ value: String) -> String {
        validDate(value, fallback: nil)
    }

    private static func validDate(_ value: String, fallback: String?) -> String {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isLocalDate(normalized), date(from: normalized) != nil else {
            return fallback.flatMap { isLocalDate($0) && date(from: $0) != nil ? $0 : nil } ?? RootineDate.localDate()
        }
        return normalized
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

    private static func travelDates(_ trip: TravelRecord, createdAt: String) -> (start: String, end: String) {
        let value = trip.dateRange
        let pieces = value.components(separatedBy: "–").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let fallback = validDate(String(createdAt.prefix(10)), fallback: "1970-01-01")
        let start = validDate(trip.startDate.isEmpty ? (pieces.first ?? fallback) : trip.startDate, fallback: fallback)
        let end = validDate(trip.endDate.isEmpty ? (pieces.count > 1 ? pieces[1] : start) : trip.endDate, fallback: start)
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
        let parse: (String) -> Date? = { value in date(from: value) }
        guard let first = parse(start), let last = parse(end) else { return 1 }
        return max(1, Calendar.current.dateComponents([.day], from: first, to: last).day ?? 1)
    }

    private static func canonicalUpdatedAt(_ goals: [CanonicalGoal]) -> String {
        goals.map(\.updatedAt).max() ?? RootineDate.isoTimestamp()
    }

    private static func canonicalSportUpdatedAt(_ workspace: CanonicalSportWorkspace) -> String {
        let timestamps = (workspace.scheduledWorkouts ?? []).map(\.updatedAt)
            + workspace.history.compactMap(\.updatedAt)
            + workspace.sessions.compactMap(\.updatedAt)
            + workspace.cycles.compactMap { try? decode(CanonicalSportCycle.self, from: $0) }.map(\.updatedAt)
            + workspace.workoutOutcomes.values.map(\.updatedAt)
        return timestamps.max() ?? RootineDate.isoTimestamp()
    }

    private static func goalCurrentValue(_ goal: CanonicalGoal) -> Double {
        if goal.progressMode == "milestones" {
            return goal.milestones.filter(\.done).reduce(0) { $0 + max(0, $1.weight) }
        }
        if goal.progressMode == "manual", goal.progressEntries.isEmpty {
            return goal.manualProgress
        }
        return goal.progressEntries
            .sorted { "\($0.date)|\($0.createdAt)|\($0.id)" < "\($1.date)|\($1.createdAt)|\($1.id)" }
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
        let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
        guard let date = Calendar.current.date(from: components) else { return nil }
        let normalized = Calendar.current.dateComponents([.year, .month, .day], from: date)
        guard normalized.year == parts[0], normalized.month == parts[1], normalized.day == parts[2] else { return nil }
        return date
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
    var updatedAt: String?
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
    var updatedAt: String?
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
    var customIcon: String?
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
    var linkedTaskIds: [Int]?
    var history: [CanonicalGoalHistory]?
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
    var note: String?
    var dueDate: String
    var done: Bool
    var completedAt: String?
    var weight: Double
    var order: Int?
    var isNext: Bool?
    var linkedTaskIds: [Int]?
}

private struct CanonicalGoalHistory: Codable {
    var id: String
    var type: String?
    var label: String
    var detail: String?
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, type, label, detail, createdAt, date
    }

    init(id: String, type: String?, label: String, detail: String?, createdAt: String) {
        self.id = id
        self.type = type
        self.label = label
        self.detail = detail
        self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        type = try container.decodeIfPresent(String.self, forKey: .type)
        label = try container.decode(String.self, forKey: .label)
        detail = try container.decodeIfPresent(String.self, forKey: .detail)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .date))
            ?? RootineDate.isoTimestamp()
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(type, forKey: .type)
        try container.encode(label, forKey: .label)
        try container.encodeIfPresent(detail, forKey: .detail)
        try container.encode(createdAt, forKey: .createdAt)
    }
}

private struct CanonicalWorkWorkspace: Codable {
    var version: Int
    var updatedAt: String
    var companies: [JSONValue]
    var projects: [JSONValue]
    var tasks: [JSONValue]
    var activeFocusStartedAt: String?
    var activeFocusProjectID: String?
    var activeFocusTaskID: String?
    var pausedFocusSessionID: String?
    var focusSessions: [JSONValue]?
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
    var stays: [JSONValue]?
    var transports: [JSONValue]?
    var bookings: [JSONValue]?
    var itinerary: [CanonicalTravelItinerary]?
    var budget: [JSONValue]?
    var documents: [JSONValue]?
    var tasks: [JSONValue]?
    var packingItems: [JSONValue]?
    var timezone: String?
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
    var startsAt: String?
    var endsAt: String?
    var timezone: String?
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
