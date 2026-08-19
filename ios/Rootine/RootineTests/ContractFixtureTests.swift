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
