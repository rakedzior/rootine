import XCTest
@testable import Rootine

final class SyncV3Tests: XCTestCase {
    func testSyncV3IdentifiersAndEnvelopeUseContractVersionThree() throws {
        let uuid = try XCTUnwrap(UUID(uuidString: "123e4567-e89b-42d3-a456-426614174000"))
        let correlationID = RootineSyncIdentifiers.correlationID(environment: .staging, uuid: uuid)
        XCTAssertEqual(correlationID, "rt3_staging_123e4567-e89b-42d3-a456-426614174000")
        XCTAssertEqual(RootineSyncIdentifiers.operationID(uuid: uuid), "op3_123e4567-e89b-42d3-a456-426614174000")
        XCTAssertEqual(RootineSyncIdentifiers.deviceID(uuid: uuid), "ios_123e4567-e89b-42d3-a456-426614174000")

        let envelope = RootineSyncRemoteClient.requestEnvelope(
            fields: ["device_id": .string("ios_123e4567-e89b-42d3-a456-426614174000")],
            action: "push",
            correlationID: correlationID
        )
        XCTAssertEqual(envelope["contract_version"], .number(3))
        XCTAssertEqual(envelope["correlation_id"], .string(correlationID))
        XCTAssertEqual(envelope["action"], .string("push"))

        let response = RootineSyncPushResponse(correlationID: correlationID, results: [])
        let responseObject = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try JSONEncoder().encode(response)) as? [String: Any]
        )
        XCTAssertEqual(responseObject["contract_version"] as? Int, 3)
        XCTAssertEqual(responseObject["correlation_id"] as? String, correlationID)
    }

    func testDeleteWireOmitsPayloadAndPushBatchCapsAt100() async throws {
        let delete = PendingSyncCommand(
            operationID: "op3_123e4567-e89b-42d3-a456-426614174000",
            deviceID: "ios_123e4567-e89b-42d3-a456-426614174000",
            entity: "task",
            entityID: "task-1",
            kind: .delete,
            baseRevision: 3,
            payload: .object(["must_not_be_sent": .bool(true)])
        )
        guard case let .object(wire) = RootineSyncRemoteClient.wireValue(for: delete) else {
            return XCTFail("Expected object wire command")
        }
        XCTAssertNil(wire["payload"])
        XCTAssertEqual(wire["kind"], .string("delete"))

        let commands = (0..<101).map { index in
            PendingSyncCommand(
                operationID: "op3_123e4567-e89b-42d3-a456-426614174\(String(format: "%02d", index))",
                deviceID: "ios_123e4567-e89b-42d3-a456-426614174000",
                entity: "task",
                entityID: "task-\(index)",
                baseRevision: 0,
                payload: .object([:])
            )
        }
        let client = RootineSyncRemoteClient(endpoint: URL(string: "https://example.invalid")!)
        do {
            _ = try await client.push(
                deviceID: "ios_123e4567-e89b-42d3-a456-426614174000",
                commands: commands,
                accessToken: "token"
            )
            XCTFail("Push must reject a batch larger than 100")
        } catch let error as RootineSyncRemoteError {
            guard case let .invalidRequest(reason) = error else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertTrue(reason.contains("100"))
        }
    }

    func testPendingCommandRoundTripUsesContractKeys() throws {
        let command = PendingSyncCommand(
            operationID: "op-1",
            deviceID: "device-1",
            entity: "task",
            entityID: "task-1",
            kind: .upsert,
            baseRevision: 7,
            payload: .object(["title": .string("Kup mleko")]),
            createdAt: "2026-09-02T09:00:00.000Z"
        )
        let data = try JSONEncoder().encode(command)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["operation_id"] as? String, "op-1")
        XCTAssertEqual(object["entity_id"] as? String, "task-1")
        XCTAssertEqual(object["base_revision"] as? Int, 7)
        XCTAssertNil(object["operationID"])
        XCTAssertEqual(try JSONDecoder().decode(PendingSyncCommand.self, from: data), command)
    }

    func testRegisterDeviceResponseFixtureDecodesRequiredEnvelopeAndFields() throws {
        let bundle = Bundle(for: SyncV3Tests.self)
        let url = try XCTUnwrap(
            bundle.url(forResource: "sync-v3-register-device-response", withExtension: "json")
        )
        let registration = try JSONDecoder().decode(
            RootineSyncDeviceRegistration.self,
            from: Data(contentsOf: url)
        )
        XCTAssertEqual(registration.contractVersion, 3)
        XCTAssertEqual(registration.correlationID, "rt3_staging_123e4567-e89b-42d3-a456-426614174000")
        XCTAssertEqual(registration.deviceID, "ios_123e4567-e89b-42d3-a456-426614174000")
        XCTAssertEqual(registration.environment, .staging)
        XCTAssertEqual(registration.platform, "ios")
        XCTAssertEqual(registration.appVersion, "unknown")
        XCTAssertEqual(registration.registeredAt, "2026-09-02T10:00:00.000Z")
    }

    func testCursorIsAtomicMonotonicAndSurvivesReload() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-cursor-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let first = RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root)
        try await first.save(42)
        let second = RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root)
        let restored = try await second.load()
        XCTAssertEqual(restored, 42)
        do {
            _ = try await second.save(41)
            XCTFail("Cursor regression should be rejected")
        } catch {
            XCTAssertEqual(error as? RootineSyncCursorError, .regressed(current: 42, requested: 41))
        }
    }

    func testOperationLogDeduplicatesByOperationIDAndSerializesSameRecord() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-oplog-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let log = RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root)
        let first = PendingSyncCommand(operationID: "a", deviceID: "device", entity: "task", entityID: "1", baseRevision: 0, payload: .null)
        let second = PendingSyncCommand(operationID: "b", deviceID: "device", entity: "task", entityID: "1", baseRevision: 1, payload: .null)
        let unrelated = PendingSyncCommand(operationID: "c", deviceID: "device", entity: "task", entityID: "2", baseRevision: 0, payload: .null)
        let firstSaved = try await log.append(first)
        let duplicateSaved = try await log.append(first)
        let secondSaved = try await log.append(second)
        let unrelatedSaved = try await log.append(unrelated)
        XCTAssertEqual(firstSaved, first)
        XCTAssertEqual(duplicateSaved, first)
        XCTAssertEqual(secondSaved, second)
        XCTAssertEqual(unrelatedSaved, unrelated)
        let pending = try await log.pending()
        XCTAssertEqual(pending.map(\.operationID), ["a", "c"])
    }

    func testNormalizedFlushBatchesIndependentRecordsAndAcksOnlyResults() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-flush-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "account", rootURL: root)
        let log = RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root)
        let cursor = RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root)
        let conflicts = RootineConflictStore(accountID: "account", deviceID: "device", rootURL: root)
        let remote = MockRootineSyncRemoteClient()
        let engine = WorkspaceSyncEngine(
            store: store,
            remote: NoopWorkspaceRemote(),
            normalizedRemote: remote,
            cursorStore: cursor,
            operationLog: log,
            conflictStore: conflicts,
            deviceID: "device"
        )
        _ = try await engine.enqueueNormalizedCommand(entity: "task", entityID: "1", baseRevision: 0, payload: .null, operationID: "one")
        _ = try await engine.enqueueNormalizedCommand(entity: "task", entityID: "1", baseRevision: 1, payload: .null, operationID: "two")
        _ = try await engine.enqueueNormalizedCommand(entity: "note", entityID: "1", baseRevision: 0, payload: .null, operationID: "three")

        let firstOutcome = try await engine.flushNormalized(accessToken: "token")
        XCTAssertEqual(firstOutcome, .applied(2))
        let pushedBatches = await remote.pushedBatches
        let firstBatch = pushedBatches.first
        XCTAssertEqual(firstBatch?.map(\.operationID), ["one", "three"])
        let pendingAfterFirst = try await engine.pendingCommandCount()
        XCTAssertEqual(pendingAfterFirst, 1)
        let secondOutcome = try await engine.flushNormalized(accessToken: "token")
        XCTAssertEqual(secondOutcome, .applied(1))
        let pendingAfterSecond = try await engine.pendingCommandCount()
        XCTAssertEqual(pendingAfterSecond, 0)
    }

    func testConflictWritesServerAndLocalRecordsToRecovery() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-conflict-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "account", rootURL: root)
        let log = RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root)
        let conflicts = RootineConflictStore(accountID: "account", deviceID: "device", rootURL: root)
        let remote = MockRootineSyncRemoteClient()
        await remote.setPushResponse(RootineSyncPushResponse(results: [RootineSyncCommandResult(
            operationID: "conflict-op",
            status: .conflict,
            serverRevision: 9,
            serverRecord: .object(["title": .string("server")])
        )]))
        let engine = WorkspaceSyncEngine(
            store: store,
            remote: NoopWorkspaceRemote(),
            normalizedRemote: remote,
            cursorStore: RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root),
            operationLog: log,
            conflictStore: conflicts,
            deviceID: "device"
        )
        _ = try await engine.enqueueNormalizedCommand(entity: "note", entityID: "note-1", baseRevision: 3, payload: .object(["title": .string("local")]), operationID: "conflict-op")
        let outcome = try await engine.flushNormalized(accessToken: "token")
        XCTAssertEqual(outcome, .conflict(["note:note-1"]))
        let saved = try await conflicts.unresolved()
        XCTAssertEqual(saved.first?.serverRevision, 9)
        XCTAssertEqual(saved.first?.serverRecord, .object(["title": .string("server")]))
        XCTAssertNotNil(saved.first?.recoveryCopyName)
        let pending = try await engine.pendingCommandCount()
        XCTAssertEqual(pending, 0)
    }

    func testRetryBackoffKeepsSuccessorBehindSameRecord() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-retry-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let log = RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root)
        let remote = MockRootineSyncRemoteClient()
        await remote.queue(error: .timeout)
        let engine = WorkspaceSyncEngine(
            store: WorkspaceFileStore(userID: "account", rootURL: root),
            remote: NoopWorkspaceRemote(),
            normalizedRemote: remote,
            cursorStore: RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root),
            operationLog: log,
            conflictStore: RootineConflictStore(accountID: "account", deviceID: "device", rootURL: root),
            deviceID: "device"
        )
        _ = try await engine.enqueueNormalizedCommand(entity: "task", entityID: "1", baseRevision: 0, payload: .null, operationID: "first")
        _ = try await engine.enqueueNormalizedCommand(entity: "task", entityID: "1", baseRevision: 1, payload: .null, operationID: "successor")
        let outcome = try await engine.flushNormalized(accessToken: "token")
        guard case .retryScheduled(let next) = outcome else {
            return XCTFail("A timeout should schedule a retry")
        }
        XCTAssertGreaterThan(next, Date())
        let pending = try await log.pending(now: Date().addingTimeInterval(10_000))
        XCTAssertEqual(pending.map(\.operationID), ["first"])
        let entries = try await log.allEntries()
        XCTAssertEqual(entries.first?.command.retry.attemptCount, 1)
    }

    func testCursorExpiryClearsOnlyCursorAndLeavesOperationLog() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-expiry-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let cursor = RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root)
        try await cursor.save(12)
        let remote = MockRootineSyncRemoteClient()
        await remote.queue(error: .cursorExpired(oldestCursor: 8))
        let log = RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root)
        let engine = WorkspaceSyncEngine(
            store: WorkspaceFileStore(userID: "account", rootURL: root),
            remote: NoopWorkspaceRemote(),
            normalizedRemote: remote,
            cursorStore: cursor,
            operationLog: log,
            conflictStore: RootineConflictStore(accountID: "account", deviceID: "device", rootURL: root),
            deviceID: "device"
        )
        do {
            _ = try await engine.pullNormalized(accessToken: "token")
            XCTFail("Expired cursor should be surfaced to the coordinator")
        } catch let error as RootineSyncRemoteError {
            guard case .cursorExpired = error else { return XCTFail("Unexpected error: \(error)") }
        }
        let cursorAfterExpiry = try await cursor.load()
        XCTAssertNil(cursorAfterExpiry)
        let pending = try await log.pending()
        XCTAssertTrue(pending.isEmpty)
    }

    func testPullCursorAdvancesOnlyAfterMaterializationAcknowledgement() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-pull-ack-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let cursor = RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root)
        let remote = MockRootineSyncRemoteClient(pullResponses: [RootineSyncPullResponse(nextCursor: 8, changes: [])])
        let engine = WorkspaceSyncEngine(
            store: WorkspaceFileStore(userID: "account", rootURL: root),
            remote: NoopWorkspaceRemote(),
            normalizedRemote: remote,
            cursorStore: cursor,
            operationLog: RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root),
            conflictStore: RootineConflictStore(accountID: "account", deviceID: "device", rootURL: root),
            deviceID: "device"
        )
        let page = try await engine.pullNormalized(accessToken: "token")
        let cursorBeforeAck = try await cursor.load()
        XCTAssertNil(cursorBeforeAck)
        try await engine.acknowledgePull(page)
        let cursorAfterAck = try await cursor.load()
        XCTAssertEqual(cursorAfterAck, 8)
    }

    func testUnauthorizedKeepsCommandPending() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-unauthorized-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let log = RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root)
        let remote = MockRootineSyncRemoteClient()
        await remote.queue(error: .unauthorized)
        let engine = WorkspaceSyncEngine(
            store: WorkspaceFileStore(userID: "account", rootURL: root),
            remote: NoopWorkspaceRemote(),
            normalizedRemote: remote,
            cursorStore: RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root),
            operationLog: log,
            conflictStore: RootineConflictStore(accountID: "account", deviceID: "device", rootURL: root),
            deviceID: "device"
        )
        _ = try await engine.enqueueNormalizedCommand(entity: "task", entityID: "1", baseRevision: 0, payload: .null, operationID: "unauthorized")
        let outcome = try await engine.flushNormalized(accessToken: "expired")
        XCTAssertEqual(outcome, .unauthorized)
        let pendingCount = try await engine.pendingCommandCount()
        XCTAssertEqual(pendingCount, 1)
    }

    func testRateLimitHonorsServerRetryAfter() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-rate-limit-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let log = RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root)
        let remote = MockRootineSyncRemoteClient()
        await remote.queue(error: .rateLimited(retryAfter: 120))
        let engine = WorkspaceSyncEngine(
            store: WorkspaceFileStore(userID: "account", rootURL: root),
            remote: NoopWorkspaceRemote(),
            normalizedRemote: remote,
            cursorStore: RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root),
            operationLog: log,
            conflictStore: RootineConflictStore(accountID: "account", deviceID: "device", rootURL: root),
            deviceID: "device"
        )
        _ = try await engine.enqueueNormalizedCommand(entity: "task", entityID: "1", baseRevision: 0, payload: .null, operationID: "rate-limit")
        let started = Date()
        guard case .retryScheduled(let next) = try await engine.flushNormalized(accessToken: "token") else {
            return XCTFail("Rate limit should schedule a retry")
        }
        XCTAssertGreaterThanOrEqual(next.timeIntervalSince(started), 119)
    }
}

private actor NoopWorkspaceRemote: WorkspaceRemoteClient {
    func apply(_ mutation: PendingWorkspaceMutation, accessToken: String) async throws -> ApplySnapshotResponse {
        ApplySnapshotResponse(
            applied: true,
            storageKey: mutation.storageKey,
            payload: mutation.payload,
            contentHash: mutation.contentHash,
            revision: mutation.expectedRevision + 1,
            updatedAt: RootineDate.isoTimestamp()
        )
    }
}
