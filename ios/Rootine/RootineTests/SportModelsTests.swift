import XCTest
@testable import Rootine

final class SportModelsTests: XCTestCase {
    func testWebV5FixtureDecodesCanonicalPlannerState() throws {
        let bundle = Bundle(for: SportModelsTests.self)
        let url = try XCTUnwrap(bundle.url(forResource: "sport-planner-v5", withExtension: "json"))
        let state = try JSONDecoder().decode(SportPlannerState.self, from: Data(contentsOf: url))

        XCTAssertEqual(state.version, 5)
        XCTAssertEqual(state.storageSchemaVersion, 5)
        XCTAssertTrue(state.templates.isEmpty)
        XCTAssertNoThrow(try state.validate())
        XCTAssertEqual(try JSONDecoder().decode(SportPlannerState.self, from: JSONEncoder().encode(state)), state)
    }

    func testWorkoutCalculationsCountUnitsAndVolume() throws {
        let session = SportWorkoutSession(
            id: "session-1",
            title: "Siła",
            discipline: .strength,
            date: "2026-09-03",
            durationMinutes: 42,
            status: .incomplete,
            exercises: [
                SportWorkoutExercise(
                    id: "exercise-1",
                    exerciseId: "squat",
                    name: "Przysiad",
                    restSeconds: 120,
                    sets: [
                        SportWorkoutSet(id: "set-1", plannedReps: 8, plannedWeight: 80, actualReps: 8, actualWeight: 82.5, done: true),
                        SportWorkoutSet(id: "set-2", plannedReps: 8, plannedWeight: 80, done: false),
                    ]
                ),
                SportWorkoutExercise(
                    id: "exercise-2",
                    exerciseId: "row",
                    name: "Wiosłowanie",
                    restSeconds: 90,
                    sets: [
                        SportWorkoutSet(id: "set-3", plannedReps: 10, plannedWeight: 50, actualReps: 10, actualWeight: 50, done: true),
                    ]
                ),
            ],
            metrics: SportWorkoutMetrics(distanceKm: nil, timeMinutes: nil, averagePace: nil, averageHeartRate: 140, maxHeartRate: 160, rpe: 7, pain: 0)
        )

        XCTAssertEqual(SportCalculations.totalUnits(in: session), 3)
        XCTAssertEqual(SportCalculations.completedUnits(in: session), 2)
        XCTAssertEqual(SportCalculations.volumeKg(in: session), 1160, accuracy: 0.0001)
        XCTAssertEqual(SportCalculations.completionRatio(in: session), 2.0 / 3.0, accuracy: 0.0001)

        let history = try XCTUnwrap(SportCalculations.historyEntry(from: session))
        XCTAssertEqual(history.unitKind, .sets)
        XCTAssertEqual(history.completedUnits, 2)
        XCTAssertEqual(history.totalUnits, 3)
        XCTAssertEqual(history.volumeKg, 1160)
        XCTAssertEqual(history.averageHeartRate, 140)
    }

    func testStageCalculationsPreferStagesOverSets() {
        let session = SportWorkoutSession(
            id: "run-1",
            title: "Bieg",
            discipline: .running,
            date: "2026-09-03",
            durationMinutes: 30,
            status: .completed,
            exercises: [],
            stages: [
                SportRunningStage(id: "warmup", label: "Rozgrzewka", kind: .warmup, target: "5 min", done: true),
                SportRunningStage(id: "main", label: "Bieg", kind: .steady, target: "4 km", done: false),
            ]
        )

        XCTAssertEqual(SportCalculations.totalUnits(in: session), 2)
        XCTAssertEqual(SportCalculations.completedUnits(in: session), 1)
        XCTAssertEqual(SportCalculations.historyEntry(from: session)?.unitKind, .stages)
    }

    func testCycleDatesAndIndefiniteWeeklyScheduleAreDeterministic() throws {
        let finite = SportTrainingCycle(id: "cycle", name: "Blok", startDate: "2026-09-07", weeks: 2, endDate: "2026-09-20", repeatWeekly: false, workouts: [], updatedAt: "2026-09-03T10:00:00.000Z")
        XCTAssertEqual(SportCalculations.cycleDate(cycle: finite, week: 2, day: 6), "2026-09-20")
        XCTAssertNil(SportCalculations.cycleDate(cycle: finite, week: 3, day: 0))

        let indefinite = SportTrainingCycle(id: "repeat", name: "Powtarzalny", startDate: "2026-09-07", weeks: 12, endDate: nil, repeatWeekly: true, workouts: [], updatedAt: "2026-09-03T10:00:00.000Z")
        let workout = SportCycleWorkout(id: "monday", week: 1, day: 0, title: "Góra", discipline: .strength, durationMinutes: 45)
        XCTAssertTrue(SportCalculations.isScheduled(workout, in: indefinite, on: "2026-09-14"))
        XCTAssertFalse(SportCalculations.isScheduled(workout, in: indefinite, on: "2026-09-15"))
        XCTAssertNoThrow(try indefinite.validate())
    }

    func testUnitsAndPaceUseCanonicalMetricValues() {
        XCTAssertEqual(SportUnits.kilograms(from: 22.046226218, unit: .pounds)!, 10, accuracy: 0.0001)
        XCTAssertEqual(SportUnits.meters(from: 1, unit: .miles)!, 1609.344, accuracy: 0.0001)
        XCTAssertEqual(SportUnits.distance(5000, in: .metric)?.unit, .kilometers)
        XCTAssertEqual(SportUnits.distance(5000, in: .metric)?.value, 5)
        XCTAssertEqual(SportCalculations.formatPace(distanceKm: 5, durationMinutes: 30), "6:00/km")
        XCTAssertNil(SportCalculations.formatPace(distanceKm: 0, durationMinutes: 30))
        XCTAssertEqual(try XCTUnwrap(SportCalculations.estimatedCalories(discipline: .running, durationMinutes: 30, bodyMassKg: 80, intensity: 5)), 336, accuracy: 0.01)
        XCTAssertNil(SportCalculations.estimatedCalories(discipline: .running, durationMinutes: 0, bodyMassKg: 80))
    }

    func testValidationRejectsDuplicateAndMalformedData() {
        var state = SportPlannerState.empty
        state.cycles = [
            SportTrainingCycle(id: "duplicate", name: "A", startDate: "2026-09-07", weeks: 1, endDate: "2026-09-13", repeatWeekly: false, workouts: [], updatedAt: "2026-09-03T10:00:00.000Z"),
            SportTrainingCycle(id: "duplicate", name: "B", startDate: "2026-09-07", weeks: 1, endDate: "2026-09-13", repeatWeekly: false, workouts: [], updatedAt: "2026-09-03T10:00:00.000Z"),
        ]
        XCTAssertThrowsError(try state.validate()) { error in
            XCTAssertEqual(error as? SportValidationError, .duplicate("cycles", "duplicate"))
        }

        XCTAssertThrowsError(try SportValidation.localDate("2026-2-01", path: "date"))
        XCTAssertThrowsError(try SportValidation.identifier("contains whitespace", path: "id"))
    }

    func testLocalFirstMutationAndNormalizedCommandAreIdempotent() throws {
        let timestamp = "2026-09-03T10:00:00.000Z"
        let workout = SportWorkout(id: "workout-1", title: "Bieg", date: "2026-09-04", minutes: 30, kind: "Bieg", completed: false, createdAt: timestamp)
        let mutation = SportWorkspaceMutation(operationID: "op-1", kind: .upsertWorkout, workoutID: workout.id, workout: workout, updatedAt: timestamp)
        let first = SportWorkspace.empty.applying(mutation)
        let second = first.applying(mutation)
        XCTAssertEqual(first, second)
        XCTAssertEqual(first.workouts.count, 1)

        let command = try SportSyncProjection.command(for: mutation, deviceID: "ios-device", baseRevision: 4)
        XCTAssertEqual(command.operationID, "op-1")
        XCTAssertEqual(command.entity, "sport_cycle_workout")
        XCTAssertEqual(command.entityID, "workout-1")
        XCTAssertEqual(command.baseRevision, 4)
        XCTAssertEqual(command.kind, .upsert)
        XCTAssertEqual(SportSyncProjection.storageKey, "rootine-sport-planner-v1")
    }
}
