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

    func testCursorStoreSeparatesAccountsAndDevicesAndRejectsMalformedEnvelope() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-cursor-scope-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }

        let accountA = RootineSyncCursorStore(accountID: "account-a", deviceID: "device-1", rootURL: root)
        try await accountA.save(9)
        let accountB = RootineSyncCursorStore(accountID: "account-b", deviceID: "device-1", rootURL: root)
        let deviceTwo = RootineSyncCursorStore(accountID: "account-a", deviceID: "device-2", rootURL: root)
        XCTAssertNil(try await accountB.load())
        XCTAssertNil(try await deviceTwo.load())

        let cursorURL = await accountA.location()
        try Data("{\"contractVersion\":1,\"accountID\":\"other\",\"deviceID\":\"device-1\",\"cursor\":9,\"updatedAt\":\"2026-09-03T10:00:00Z\"}".utf8)
            .write(to: cursorURL, options: .atomic)
        do {
            _ = try await accountA.load()
            XCTFail("A cursor envelope from another account must be rejected")
        } catch {
            XCTAssertEqual(error as? RootineSyncCursorError, .invalid)
        }

        try Data("not-json".utf8).write(to: cursorURL, options: .atomic)
        do {
            _ = try await accountA.load()
            XCTFail("Malformed cursor data must be rejected")
        } catch {
            XCTAssertEqual(error as? RootineSyncCursorError, .invalid)
        }
    }

    func testSecureStorageNamespacesAccountsWithoutEmbeddingIdentifiers() {
        let first = RootineSecureStorageSupport.accountNamespace("user-a@example.com")
        let second = RootineSecureStorageSupport.accountNamespace("user-b@example.com")

        XCTAssertNotEqual(first, second)
        XCTAssertFalse(first.contains("user-a"))
        XCTAssertFalse(first.contains("@"))
        XCTAssertEqual(first, RootineSecureStorageSupport.accountNamespace("user-a@example.com"))
        XCTAssertEqual(first.count, "account-".count + 64)

        let unsafe = RootineSecureStorageSupport.accountPathComponent("../other-account")
        XCTAssertFalse(unsafe.contains("/"))
        XCTAssertFalse(unsafe.contains(".."))
        XCTAssertTrue(unsafe.contains("-"))
    }

    func testProductionNetworkSessionDoesNotPersistCookiesOrResponses() {
        let session = RootineSecureURLSession.make()
        defer { session.invalidateAndCancel() }

        XCTAssertNil(session.configuration.urlCache)
        XCTAssertNil(session.configuration.httpCookieStorage)
        XCTAssertEqual(session.configuration.requestCachePolicy, .reloadIgnoringLocalCacheData)
    }

    func testCorruptRolloutFlagIsIgnoredAndDefaultsOff() {
        let suite = "RootineSecureStorageFeatureFlag.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let accountID = "account-a"
        let environment = "staging"
        let legacyKey = "rootine.feature.normalized_read_enabled.\(environment).\(accountID)"
        defaults.set("not-a-bool", forKey: legacyKey)

        let flags = UserDefaultsRootineReadFeatureFlagStore(defaults: defaults)
        XCTAssertFalse(flags.normalizedReadEnabled(accountID: accountID, environment: environment))
        // A corrupt legacy key is ignored but retained so this release does
        // not perform an irreversible downgrade-breaking migration.
        XCTAssertEqual(defaults.object(forKey: legacyKey) as? String, "not-a-bool")
    }

    func testWorkspaceFilesUseDataProtectionAndRefuseBroadRootDeletion() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-protection-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = WorkspaceFileStore(userID: "protected-user", rootURL: root)
        let workspace = TaskWorkspace(version: 2, updatedAt: "2026-09-02T10:00:00Z", tasks: [], habits: [], lists: [], tags: [])

        try await store.save(workspace, key: .tasks)
        let file = root.appendingPathComponent("Workspaces/rootine-task-workspace-v1.json")
        let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
        XCTAssertEqual(attributes[.protectionKey] as? FileProtectionType, .completeUntilFirstUserAuthentication)

        let broadStore = WorkspaceFileStore(
            userID: "protected-user",
            rootURL: FileManager.default.temporaryDirectory
        )
        do {
            try await broadStore.clearAllLocalData()
            XCTFail("A broad temporary root must not be deleted")
        } catch {
            XCTAssertEqual(error as? WorkspaceFileStoreError, .invalidRoot)
        }
    }

    func testCorruptCursorIsRemovedForControlledBootstrap() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-corrupt-cursor-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let directory = root.appendingPathComponent("Sync/device", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let cursorURL = directory.appendingPathComponent("cursor.json")
        try Data("not-a-cursor".utf8).write(to: cursorURL, options: .atomic)

        let store = RootineSyncCursorStore(accountID: "account", deviceID: "device", rootURL: root)
        do {
            _ = try await store.load()
            XCTFail("A corrupt cursor must not be accepted")
        } catch {
            XCTAssertEqual(error as? RootineSyncCursorError, .invalid)
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: cursorURL.path))
    }

    func testCorruptOperationAndConflictCachesAreQuarantined() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("rootine-corrupt-sync-caches-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let directory = root.appendingPathComponent("Sync/device", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let operationURL = directory.appendingPathComponent("operations.json")
        try Data("broken-operation-log".utf8).write(to: operationURL, options: .atomic)
        let log = RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root)
        XCTAssertTrue(try await log.allEntries().isEmpty)

        let operationQuarantine = try FileManager.default.contentsOfDirectory(
            atPath: directory.appendingPathComponent("Recovery", isDirectory: true).path
        )
            .first(where: { $0.hasPrefix("operations-corrupt-") })
        XCTAssertNotNil(operationQuarantine)

        let conflictURL = directory.appendingPathComponent("conflicts.json")
        try Data("broken-conflicts".utf8).write(to: conflictURL, options: .atomic)
        let conflicts = RootineConflictStore(accountID: "account", deviceID: "device", rootURL: root)
        XCTAssertTrue(try await conflicts.list().isEmpty)
        let conflictQuarantine = try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .first(where: { $0.hasPrefix("conflicts-corrupt-") })
        XCTAssertNotNil(conflictQuarantine)
    }

    func testCorruptNotificationPreferencesResetToSafeDefaults() {
        let suite = "RootineSecureStoragePreferences.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let key = RootineSecureStorageSupport.defaultsKey(
            prefix: "rootine.notification.preferences.",
            accountID: "account-a"
        )
        defaults.set(Data("broken-preferences".utf8), forKey: key)

        XCTAssertNil(RootineNotificationPreferencesStore.load(userID: "account-a", defaults: defaults))
        XCTAssertNil(defaults.data(forKey: key))
    }

    func testNotificationRequestMetadataDoesNotContainAccountOrEntityIdentifiers() {
        let occurrence = RootineNotificationOccurrence(
            entity: .task,
            entityID: "private-task-id",
            localDate: "2026-09-02",
            localTime: "08:45",
            scheduledAt: Date(timeIntervalSince1970: 10),
            userID: "private-account-id"
        )

        let metadata = occurrence.userInfo
        XCTAssertNil(metadata["rootine_dedupe_key"])
        XCTAssertNil(metadata["rootine_entity_id"])
        XCTAssertNil(metadata["rootine_occurrence_id"])
        XCTAssertNotNil(metadata["rootine_occurrence_hash"] as? String)
        XCTAssertFalse(occurrence.requestIdentifier(for: "private-account-id").contains("private-account-id"))
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
            entity: "note",
            entityID: "note-1",
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

    func testRetryLimitMovesExhaustedCommandToDeadLetter() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("rootine-retry-limit-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let log = RootineSyncOperationLog(accountID: "account", deviceID: "device", rootURL: root)
        let exhausted = PendingSyncCommand(
            operationID: "exhausted",
            deviceID: "device",
            entity: "task",
            entityID: "1",
            baseRevision: 0,
            payload: .null,
            // Seven recorded failures means this timeout is failure eight and
            // must be dead-lettered without scheduling a ninth request.
            retry: SyncRetryMetadata(attemptCount: RootineSyncRetryPolicy.maxAttempts - 1)
        )
        _ = try await log.append(exhausted)
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

        XCTAssertEqual(try await engine.flushNormalized(accessToken: "token"), .error)
        XCTAssertTrue(try await log.pending().isEmpty)
        XCTAssertEqual(try await log.entry(operationID: "exhausted")?.state, .deadLetter)
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
