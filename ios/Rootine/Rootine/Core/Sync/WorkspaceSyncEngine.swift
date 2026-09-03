import CryptoKit
import Foundation

enum WorkspaceSyncOutcome: Equatable {
    case idle
    case applied(Int)
    case conflict([String])
}

enum RootineSyncFlushOutcome: Equatable, Sendable {
    case idle
    case applied(Int)
    case conflict([String])
    case retryScheduled(Date)
    case unauthorized
    case cursorExpired
    case error
}

enum RootineSyncPullApplyOutcome: Equatable, Sendable {
    case applied
    case deleted
    case ignoredWhileEditing
    case conflict(String)
}

struct WorkspaceSyncPayload: Sendable {
    let storageKey: String
    let payload: JSONValue
}

actor WorkspaceSyncEngine {
    private let store: WorkspaceFileStore
    private let remote: WorkspaceRemoteClient
    private let normalizedRemote: (any RootineSyncRemoteClientProtocol)?
    private let operationLog: RootineSyncOperationLog?
    private let cursorStore: RootineSyncCursorStore?
    private let conflictStore: RootineConflictStore?
    private let deviceID: String?
    private let now: @Sendable () -> Date
    private let observability: RootineObservability
    private let encoder: JSONEncoder
    private let decoder = JSONDecoder()
    // Share one awaitable result between concurrent callers. Returning `.idle`
    // while another flush is active made the UI briefly claim everything was
    // synced even though the first request could still fail or conflict.
    private var inFlightFlush: Task<WorkspaceSyncOutcome, Error>?
    private var inFlightNormalizedFlush: Task<RootineSyncFlushOutcome, Error>?

    init(store: WorkspaceFileStore, remote: WorkspaceRemoteClient) {
        self.store = store
        self.remote = remote
        normalizedRemote = nil
        operationLog = nil
        cursorStore = nil
        conflictStore = nil
        deviceID = nil
        now = Date.init
        observability = .shared
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
    }

    /// v3 initializer. The legacy remote remains required so existing
    /// aggregate reconcile code can run unchanged during shadow rollout.
    init(
        store: WorkspaceFileStore,
        remote: WorkspaceRemoteClient,
        normalizedRemote: any RootineSyncRemoteClientProtocol,
        deviceID: String,
        accountID: String = "default",
        cursorStore: RootineSyncCursorStore? = nil,
        operationLog: RootineSyncOperationLog? = nil,
        conflictStore: RootineConflictStore? = nil,
        now: @escaping @Sendable () -> Date = Date.init,
        observability: RootineObservability = .shared
    ) {
        self.store = store
        self.remote = remote
        self.normalizedRemote = normalizedRemote
        self.deviceID = deviceID
        self.now = now
        self.cursorStore = cursorStore ?? RootineSyncCursorStore(accountID: accountID, deviceID: deviceID)
        self.operationLog = operationLog ?? RootineSyncOperationLog(accountID: accountID, deviceID: deviceID)
        self.conflictStore = conflictStore ?? RootineConflictStore(accountID: accountID, deviceID: deviceID)
        self.observability = observability
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
    }

    /// Convenience for tests and small integrations which do not use the
    /// legacy aggregate remote. A no-op legacy adapter is intentionally not
    /// provided: callers must make the fallback explicit.
    init(
        store: WorkspaceFileStore,
        remote: WorkspaceRemoteClient,
        normalizedRemote: any RootineSyncRemoteClientProtocol,
        cursorStore: RootineSyncCursorStore,
        operationLog: RootineSyncOperationLog,
        conflictStore: RootineConflictStore,
        deviceID: String,
        now: @escaping @Sendable () -> Date = Date.init,
        observability: RootineObservability = .shared
    ) {
        self.store = store
        self.remote = remote
        self.normalizedRemote = normalizedRemote
        self.cursorStore = cursorStore
        self.operationLog = operationLog
        self.conflictStore = conflictStore
        self.deviceID = deviceID
        self.now = now
        self.observability = observability
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
    }

    func pendingMutationCount() async throws -> Int {
        try await store.pendingMutations().count
    }

    func pendingCommandCount() async throws -> Int {
        guard let operationLog else { return 0 }
        return try await operationLog.pending(now: now()).count
    }

    @discardableResult
    func enqueue<T: Encodable & Sendable>(_ value: T, key: RootineStorageKey) async throws -> PendingWorkspaceMutation {
        let data = try encoder.encode(value)
        let payload = try decoder.decode(JSONValue.self, from: data)
        return try await enqueue(payload: payload, storageKey: key.rawValue)
    }

    /// Enqueues an already mapped canonical document. Native More models use
    /// this overload so their compact local representation never leaks into a
    /// snapshot consumed by the web client.
    @discardableResult
    func enqueue(payload: JSONValue, storageKey: String) async throws -> PendingWorkspaceMutation {
        return try await enqueueBatch([
            WorkspaceSyncPayload(storageKey: storageKey, payload: payload)
        ]).first!
    }

    /// Computes and persists every mutation in one queue write. Existing
    /// entries remain coalesced by workspace and identical operations remain
    /// idempotent.
    @discardableResult
    func enqueueBatch(_ payloads: [WorkspaceSyncPayload]) async throws -> [PendingWorkspaceMutation] {
        guard !payloads.isEmpty else { return [] }
        var queue = try await store.pendingMutations()
        var mutations: [PendingWorkspaceMutation] = []
        for request in payloads {
            let data = try encoder.encode(request.payload)
            let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            let expectedRevision = try await store.revision(for: request.storageKey)
            let mutationIDData = Data("ios:\(request.storageKey):\(expectedRevision):\(digest)".utf8)
            let mutationID = SHA256.hash(data: mutationIDData).map { String(format: "%02x", $0) }.joined()
            if let duplicate = queue.first(where: {
                $0.storageKey == request.storageKey
                    && $0.contentHash == digest
                    && $0.expectedRevision == expectedRevision
            }) {
                mutations.append(duplicate)
                continue
            }
            let mutation = PendingWorkspaceMutation(
                id: mutationID,
                storageKey: request.storageKey,
                payload: request.payload,
                contentHash: digest,
                expectedRevision: expectedRevision,
                createdAt: RootineDate.isoTimestamp(),
                cursor: try await cursorStore?.load() ?? 0
            )
            queue.removeAll { $0.storageKey == request.storageKey }
            queue.append(mutation)
            mutations.append(mutation)
        }
        try await store.replacePendingMutations(queue)
        return mutations
    }

    /// Adds one normalized mutation to the durable operation log. The caller
    /// should persist the aggregate first, preserving local-first semantics;
    /// this method never removes or coalesces legacy snapshot mutations.
    @discardableResult
    func enqueue(_ command: PendingSyncCommand) async throws -> PendingSyncCommand {
        guard let operationLog else { throw RootineSyncEngineError.normalizedSyncUnavailable }
        return try await operationLog.append(command)
    }

    @discardableResult
    func enqueue(normalizedCommand command: PendingSyncCommand) async throws -> PendingSyncCommand {
        try await enqueue(command)
    }

    @discardableResult
    func enqueueNormalizedCommand(
        entity: String,
        entityID: String,
        kind: RootineSyncCommandKind = .upsert,
        baseRevision: Int64,
        payload: JSONValue,
        operationID: String = RootineSyncIdentifiers.operationID()
    ) async throws -> PendingSyncCommand {
        guard let deviceID else { throw RootineSyncEngineError.normalizedSyncUnavailable }
        return try await enqueue(PendingSyncCommand(
            operationID: operationID,
            deviceID: deviceID,
            entity: entity,
            entityID: entityID,
            kind: kind,
            baseRevision: baseRevision,
            payload: payload,
            createdAt: now()
        ))
    }

    func flush(accessToken: String) async throws -> WorkspaceSyncOutcome {
        if let inFlightFlush {
            return try await inFlightFlush.value
        }

        let task = Task { [self] in
            try await performFlush(accessToken: accessToken)
        }
        inFlightFlush = task
        defer { inFlightFlush = nil }
        return try await task.value
    }

    private func performFlush(accessToken: String) async throws -> WorkspaceSyncOutcome {

        var applied = 0
        var conflicts: [String] = []
        var attemptedMutationIDs: Set<String> = []
        while let mutation = try await store.pendingMutations().first(where: {
            !attemptedMutationIDs.contains($0.id)
        }) {
            attemptedMutationIDs.insert(mutation.id)
            let response = try await remote.apply(mutation, accessToken: accessToken)
            if response.applied {
                try await store.acknowledgeMutation(
                    id: mutation.id,
                    storageKey: mutation.storageKey,
                    revision: response.revision,
                    cursor: response.changeCursor
                )
                applied += 1
            } else {
                conflicts.append(mutation.storageKey)
            }
        }
        guard applied > 0 || !conflicts.isEmpty else { return .idle }
        return conflicts.isEmpty ? .applied(applied) : .conflict(conflicts)
    }

    /// Pushes one command per record in a batch. A successor for a record is
    /// held in the durable log until the preceding command is ACKed; unrelated
    /// records can still share the same request.
    func flushNormalized(accessToken: String) async throws -> RootineSyncFlushOutcome {
        guard normalizedRemote != nil, operationLog != nil else {
            throw RootineSyncEngineError.normalizedSyncUnavailable
        }
        if let inFlightNormalizedFlush {
            return try await inFlightNormalizedFlush.value
        }
        let task = Task { [self] in try await performNormalizedFlush(accessToken: accessToken) }
        inFlightNormalizedFlush = task
        defer { inFlightNormalizedFlush = nil }
        return try await task.value
    }

    private func performNormalizedFlush(accessToken: String) async throws -> RootineSyncFlushOutcome {
        guard let normalizedRemote, let operationLog, let deviceID else {
            throw RootineSyncEngineError.normalizedSyncUnavailable
        }
        let pending = try await operationLog.pending(now: now())
        guard !pending.isEmpty else { return .idle }

        var batch: [PendingSyncCommand] = []
        var recordKeys = Set<String>()
        for command in pending where batch.count < 100 {
            let recordKey = "\(command.entity)\u{1F}\(command.entityID)"
            guard recordKeys.insert(recordKey).inserted else { continue }
            guard command.deviceID == deviceID else { continue }
            batch.append(command)
        }
        guard !batch.isEmpty else { return .idle }

        let response: RootineSyncPushResponse
        do {
            response = try await normalizedRemote.push(deviceID: deviceID, commands: batch, accessToken: accessToken)
        } catch let error as RootineSyncRemoteError {
            switch error {
            case .unauthorized:
                observability.increment(.syncUnauthorized)
                observability.recordSync(endpoint: "push", outcome: .failure, error: error.localizedDescription, attributes: ["status": "unauthorized"])
                return .unauthorized
            case .cursorExpired:
                observability.increment(.syncCursorExpired)
                observability.recordSync(endpoint: "push", outcome: .degraded, error: error.localizedDescription, attributes: ["status": "cursor_expired"])
                try await cursorStore?.reset()
                return .cursorExpired
            case .timeout, .rateLimited, .server, .network:
                observability.increment(.syncRetry)
                observability.recordSync(endpoint: "push", outcome: .degraded, error: error.localizedDescription)
                let schedule = try await scheduleRetries(batch, error: error)
                return schedule.scheduled ? .retryScheduled(schedule.next) : .error
            default:
                observability.recordSync(endpoint: "push", outcome: .failure, error: error.localizedDescription)
                for command in batch {
                    try await operationLog.markDeadLetter(operationID: command.operationID, reason: error.localizedDescription, at: now())
                }
                return .error
            }
        }

        var applied = 0
        var conflictKeys: [String] = []
        // A malformed server response must not crash the actor. Keeping the
        // last result for a duplicate ID makes the command retryable through
        // the missing/invalid-result path below.
        let results = response.results.reduce(into: [String: RootineSyncCommandResult]()) { resultByID, result in
            resultByID[result.operationID] = result
        }
        if results.count != response.results.count
            || response.results.contains(where: { result in
                !batch.contains(where: { command in command.operationID == result.operationID })
            }) {
            let schedule = try await scheduleRetries(batch, error: RootineSyncRemoteError.invalidResponse)
            return schedule.scheduled ? .retryScheduled(schedule.next) : .error
        }
        for command in batch {
            guard let result = results[command.operationID] else {
                let schedule = try await scheduleRetries([command], error: RootineSyncRemoteError.invalidResponse)
                return schedule.scheduled ? .retryScheduled(schedule.next) : .error
            }
            if result.entity != command.entity
                || result.entityID != command.entityID
                || (result.status == .applied && (result.revision == nil || result.revision! < 0)) {
                let schedule = try await scheduleRetries([command], error: RootineSyncRemoteError.invalidResponse)
                return schedule.scheduled ? .retryScheduled(schedule.next) : .error
            }
            switch result.status {
            case .applied, .alreadyApplied:
                try await operationLog.markApplied(operationID: command.operationID)
                observability.recordSync(endpoint: "push", outcome: .success, operationID: command.operationID, attributes: ["status": result.status.rawValue])
                applied += 1
            case .conflict:
                try await recordConflict(command: command, result: result)
                try await operationLog.markDeadLetter(operationID: command.operationID, reason: "conflict", at: now())
                observability.increment(.syncConflict)
                observability.recordSync(endpoint: "push", outcome: .degraded, operationID: command.operationID, attributes: ["status": "conflict"])
                conflictKeys.append("\(command.entity):\(command.entityID)")
            case .invalid, .unauthorized, .custom:
                let reason = result.message ?? result.status.rawValue
                try await operationLog.markDeadLetter(operationID: command.operationID, reason: reason, at: now())
                observability.recordSync(endpoint: "push", outcome: .failure, operationID: command.operationID, error: reason, attributes: ["status": result.status.rawValue])
            }
        }
        if !conflictKeys.isEmpty { return .conflict(conflictKeys) }
        return applied == 0 ? .idle : .applied(applied)
    }

    private func scheduleRetries(
        _ commands: [PendingSyncCommand],
        error: Error
    ) async throws -> (next: Date, scheduled: Bool) {
        guard let operationLog else { throw RootineSyncEngineError.normalizedSyncUnavailable }
        let timestamp = now()
        var next = timestamp
        var scheduled = false
        for command in commands {
            // attemptCount is the number of failures already recorded. The
            // current failure is the next attempt, so dead-letter on the
            // eighth failure rather than permitting a ninth request.
            if command.retry.attemptCount + 1 >= RootineSyncRetryPolicy.maxAttempts {
                try await operationLog.markDeadLetter(
                    operationID: command.operationID,
                    reason: "retry_limit_exceeded",
                    at: timestamp
                )
                continue
            }
            let policyDelay = RootineSyncRetryPolicy.delay(attempt: command.retry.attemptCount)
            let serverDelay: TimeInterval
            if case let RootineSyncRemoteError.rateLimited(retryAfter) = error {
                serverDelay = retryAfter ?? 0
            } else {
                serverDelay = 0
            }
            let delay = max(policyDelay, serverDelay)
            let attemptNext = timestamp.addingTimeInterval(delay)
            next = max(next, attemptNext)
            scheduled = true
            try await operationLog.recordRetry(
                operationID: command.operationID,
                at: timestamp,
                error: error.localizedDescription,
                nextAttemptAt: attemptNext
            )
        }
        return (next, scheduled)
    }

    private func recordConflict(command: PendingSyncCommand, result: RootineSyncCommandResult) async throws {
        guard let conflictStore else { return }
        let recoveryName: String?
        let recoveryPayload = JSONValue.object([
            "operation_id": .string(command.operationID),
            "entity": .string(command.entity),
            "entity_id": .string(command.entityID),
            "local_record": command.payload,
            "server_record": result.serverRecord ?? .null
        ])
        if let data = try? encoder.encode(recoveryPayload),
           let recovery = try? await store.writeRecoveryCopy(
               data,
               label: "conflict-\(command.entity)-\(command.entityID)",
               kind: .diagnostic
           ) {
            recoveryName = recovery.name
        } else {
            recoveryName = nil
        }
        try await conflictStore.create(
            operationID: command.operationID,
            entity: command.entity,
            entityID: command.entityID,
            localRecord: command.payload,
            serverRecord: result.serverRecord,
            localBaseRevision: command.baseRevision,
            serverRevision: result.serverRevision,
            recoveryCopyName: recoveryName
        )
    }

    func bootstrapNormalized(accessToken: String) async throws -> RootineSyncBootstrapResponse {
        guard let normalizedRemote, let deviceID else {
            throw RootineSyncEngineError.normalizedSyncUnavailable
        }
        do {
            let response = try await normalizedRemote.bootstrap(deviceID: deviceID, accessToken: accessToken)
            return response
        } catch let error as RootineSyncRemoteError {
            if case .cursorExpired = error { try await cursorStore?.reset() }
            throw error
        }
    }

    func pullNormalized(accessToken: String, limit: Int = 500) async throws -> RootineSyncPullResponse {
        guard let normalizedRemote, let deviceID else {
            throw RootineSyncEngineError.normalizedSyncUnavailable
        }
        let cursor = try await cursorStore?.load()
        do {
            let response = try await normalizedRemote.pull(cursor: cursor, limit: limit, deviceID: deviceID, accessToken: accessToken)
            return response
        } catch let error as RootineSyncRemoteError {
            if case .cursorExpired = error { try await cursorStore?.reset() }
            throw error
        }
    }

    /// Advances the durable cursor only after the caller has materialized the
    /// returned page. Keeping fetch and acknowledgement separate makes a
    /// force-quit between those phases replay-safe.
    func acknowledgeBootstrap(_ response: RootineSyncBootstrapResponse) async throws {
        try await cursorStore?.save(response.nextCursor ?? response.cursor)
    }

    /// Advances the durable cursor only after every change in the page has
    /// been applied (or durably recorded as a conflict).
    func acknowledgePull(_ response: RootineSyncPullResponse) async throws {
        try await cursorStore?.save(response.nextCursor)
    }

    /// Applies the safety decision for a pulled record. Actual aggregate
    /// decoding is intentionally left to AppEnvironment; this method makes it
    /// impossible for a pull to silently overwrite an active local draft.
    func applyPulledChange(
        _ change: RootineSyncChange,
        localRecord: JSONValue?,
        hasPendingLocalEdit: Bool
    ) async throws -> RootineSyncPullApplyOutcome {
        if hasPendingLocalEdit {
            let local = localRecord ?? .null
            let recoveryName: String?
            let payload = JSONValue.object([
                "entity": .string(change.entity),
                "entity_id": .string(change.entityID),
                "local_record": local,
                "server_record": change.record ?? .null
            ])
            if let data = try? encoder.encode(payload),
               let recovery = try? await store.writeRecoveryCopy(
                   data,
                   label: "pull-conflict-\(change.entity)-\(change.entityID)",
                   kind: .diagnostic
               ) {
                recoveryName = recovery.name
            } else { recoveryName = nil }
            try await conflictStore?.create(
                operationID: nil,
                entity: change.entity,
                entityID: change.entityID,
                localRecord: local,
                serverRecord: change.record,
                localBaseRevision: nil,
                serverRevision: change.revision,
                recoveryCopyName: recoveryName
            )
            return .conflict("\(change.entity):\(change.entityID)")
        }
        if case .delete = change.operation { return .deleted }
        return .applied
    }
}

enum RootineSyncEngineError: Error, Equatable, Sendable {
    case normalizedSyncUnavailable
}
