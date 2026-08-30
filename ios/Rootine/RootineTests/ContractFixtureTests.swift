import XCTest
@testable import Rootine

final class ContractFixtureTests: XCTestCase {
    func testTaskFixtureDecodesWithoutLosingScheduledAndHabitData() throws {
        let workspace = try fixture("task-workspace-v2", as: TaskWorkspace.self)

        XCTAssertEqual(workspace.version, 2)
        XCTAssertEqual(workspace.tasks.count, 2)
        XCTAssertEqual(workspace.tasks.first?.schedule?.timezone, "Europe/Warsaw")
        XCTAssertEqual(workspace.habits.first?.schedule?.type, "daily")
        XCTAssertEqual(try roundTrip(workspace), workspace)
    }

    func testNutritionFixtureDecodesCalculatorDiaryAndProductIdentity() throws {
        let workspace = try fixture("nutrition-workspace-v6", as: NutritionWorkspace.self)

        XCTAssertEqual(workspace.version, 6)
        XCTAssertEqual(workspace.calculatorProfile?.activities.first?.type, "strength")
        XCTAssertEqual(workspace.days["2026-08-19"]?.entries.breakfast.first?.catalogId, "off-5901234123457")
        XCTAssertEqual(try roundTrip(workspace), workspace)
    }

    func testNotesFixtureDecodesChecklistAndPolishText() throws {
        let workspace = try fixture("notes-workspace-v1", as: NotesWorkspace.self)

        XCTAssertEqual(workspace.version, 1)
        XCTAssertEqual(workspace.notes.first?.items.count, 2)
        XCTAssertEqual(workspace.notes.first?.title, "Pytania na rozmowę")
        XCTAssertEqual(try roundTrip(workspace), workspace)
    }

    func testMoreCanonicalFixturesProjectToNativeModels() throws {
        let sportPayload = try fixture("sport-planner-v5", as: JSONValue.self)
        let goalsPayload = try fixture("goals-workspace-v1", as: JSONValue.self)
        let workPayload = try fixture("work-workspace-v3", as: JSONValue.self)
        let travelPayload = try fixture("travel-workspace-v2", as: JSONValue.self)
        let healthPayload = try fixture("health-workspace-v1", as: JSONValue.self)

        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.sportWorkspace(from: sportPayload).version, 1)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.goalsWorkspace(from: goalsPayload).version, 1)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.workWorkspace(from: workPayload).version, 1)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.travelWorkspace(from: travelPayload).version, 1)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.healthWorkspace(from: healthPayload).version, 1)
    }

    func testNativeNoOpMergePreservesRichWebOnlyFields() throws {
        let goalsPayload = try fixture("goals-workspace-v1", as: JSONValue.self)
        let travelPayload = try fixture("travel-workspace-v2", as: JSONValue.self)

        let nativeGoals = try RootineCanonicalWorkspaceMapping.goalsWorkspace(from: goalsPayload)
        let nativeTravel = try RootineCanonicalWorkspaceMapping.travelWorkspace(from: travelPayload)

        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.mergedGoalsPayload(for: nativeGoals, onto: goalsPayload), goalsPayload)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.mergedTravelPayload(for: nativeTravel, onto: travelPayload), travelPayload)

        if case .object(let deletedGoals) = try RootineCanonicalWorkspaceMapping.mergedGoalsPayload(for: .empty, onto: goalsPayload),
           case .array(let goals) = deletedGoals["goals"] {
            XCTAssertTrue(goals.isEmpty)
        } else {
            XCTFail("Native goal deletion should be reflected in the canonical document")
        }
        if case .object(let deletedTrips) = try RootineCanonicalWorkspaceMapping.mergedTravelPayload(for: .empty, onto: travelPayload),
           case .array(let trips) = deletedTrips["trips"] {
            XCTAssertTrue(trips.isEmpty)
        } else {
            XCTFail("Native trip deletion should be reflected in the canonical document")
        }
    }

    func testSportNoOpMergePreservesRichRecordFields() throws {
        let timestamp = "2026-08-30T12:00:00.000Z"
        let workout = SportWorkout(id: "ios-rich-sport", title: "Bieg", date: "2026-08-30", minutes: 30, kind: "Bieg", completed: true, createdAt: timestamp)
        var rich = try RootineCanonicalWorkspaceMapping.payload(for: SportWorkspace(version: 1, updatedAt: timestamp, workouts: [workout]))
        if case .object(var root) = rich,
           case .array(var sessions) = root["sessions"],
           case .object(var session) = sessions[0] {
            session["exercises"] = .array([.object(["exerciseId": .string("web-exercise"), "sets": .number(4)])])
            session["metrics"] = .object(["distanceKm": .number(8.4)])
            sessions[0] = .object(session)
            root["sessions"] = .array(sessions)
            rich = .object(root)
        }
        let native = try RootineCanonicalWorkspaceMapping.sportWorkspace(from: rich)
        XCTAssertEqual(try RootineCanonicalWorkspaceMapping.mergedSportPayload(for: native, onto: rich), rich)
    }

    func testMoreNativePayloadsUseCanonicalKeysAndShapes() throws {
        let timestamp = "2026-08-30T12:00:00.000Z"
        let workout = SportWorkout(id: "ios-workout", title: "Bieg", date: "2026-08-30", minutes: 30, kind: "Bieg", completed: true, createdAt: timestamp)
        let pendingWorkout = SportWorkout(id: "ios-pending", title: "Mobilność", date: "2026-08-31", minutes: 20, kind: "Mobilność", completed: false, createdAt: timestamp)
        let sport = try RootineCanonicalWorkspaceMapping.payload(for: SportWorkspace(version: 1, updatedAt: timestamp, workouts: [workout]))
        let pendingSport = try RootineCanonicalWorkspaceMapping.payload(for: SportWorkspace(version: 1, updatedAt: timestamp, workouts: [pendingWorkout]))
        let goals = try RootineCanonicalWorkspaceMapping.payload(for: GoalsWorkspace(version: 1, updatedAt: timestamp, goals: [GoalRecord(id: "ios-goal", title: "Cel", detail: "Opis", current: 1, target: 10, icon: "target", createdAt: timestamp, updatedAt: timestamp)]))
        let work = try RootineCanonicalWorkspaceMapping.payload(for: WorkWorkspace(version: 1, updatedAt: timestamp, activeFocusStartedAt: nil, focusSessions: []))
        let travel = try RootineCanonicalWorkspaceMapping.payload(for: TravelWorkspace(version: 1, updatedAt: timestamp, trips: []))
        let health = try RootineCanonicalWorkspaceMapping.payload(for: HealthWorkspace(version: 1, updatedAt: timestamp, checkIns: [:], reminders: [HealthReminder(id: "reminder", title: "Woda", detail: "Szklanka", completedDates: [])]))

        XCTAssertEqual(RootineCanonicalWorkspaceMapping.storageKey(for: .sport), "rootine-sport-planner-v1")
        XCTAssertEqual(RootineCanonicalWorkspaceMapping.storageKey(for: .goals), "rootine.goals.v1")
        XCTAssertEqual(RootineCanonicalWorkspaceMapping.storageKey(for: .health), "rootine.health.workspace.v1")
        if case .object(let sportObject) = sport { XCTAssertNil(sportObject["updatedAt"]) }
        let clearedSport = try RootineCanonicalWorkspaceMapping.mergedSportPayload(for: .empty, onto: pendingSport)
        if case .object(let clearedObject) = clearedSport, case .array(let cycles) = clearedObject["cycles"] {
            XCTAssertEqual(cycles.count, 1)
            if case .object(let cycle) = cycles[0], case .array(let workouts) = cycle["workouts"] { XCTAssertTrue(workouts.isEmpty) }
        } else {
            XCTFail("Sport cycle should retain its canonical shape after native deletion")
        }
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.sportWorkspace(from: sport))
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.goalsWorkspace(from: goals))
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.workWorkspace(from: work))
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.travelWorkspace(from: travel))
        XCTAssertNoThrow(try RootineCanonicalWorkspaceMapping.healthWorkspace(from: health))
    }

    func testNormalizedProductFixtureMatchesNativeModel() throws {
        let product = try fixture("nutrition-product", as: NutritionProduct.self)

        XCTAssertEqual(product.barcode, "5901234123457")
        XCTAssertEqual(product.source, "openfoodfacts")
        XCTAssertEqual(product.per100g.protein, 12)
    }

    func testFileStorePersistsWorkspaceAndCoalescesPendingMutation() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "user-a", rootURL: root)
        let workspace = try fixture("task-workspace-v2", as: TaskWorkspace.self)

        try await store.save(workspace, key: .tasks)
        let restored = try await store.load(TaskWorkspace.self, key: .tasks)
        XCTAssertEqual(restored, workspace)

        let payload = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(workspace))
        try await store.enqueue(PendingWorkspaceMutation(id: "first", storageKey: RootineStorageKey.tasks.rawValue, payload: payload, contentHash: "a", expectedRevision: 0, createdAt: RootineDate.isoTimestamp()))
        try await store.enqueue(PendingWorkspaceMutation(id: "second", storageKey: RootineStorageKey.tasks.rawValue, payload: payload, contentHash: "b", expectedRevision: 0, createdAt: RootineDate.isoTimestamp()))

        let queue = try await store.pendingMutations()
        XCTAssertEqual(queue.map(\.id), ["second"])
    }

    private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        let bundle = Bundle(for: ContractFixtureTests.self)
        let url = try XCTUnwrap(bundle.url(forResource: name, withExtension: "json"))
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    private func roundTrip<T: Codable>(_ value: T) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONEncoder().encode(value))
    }
}
