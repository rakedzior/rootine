import CryptoKit
import Foundation

enum WorkspaceSyncOutcome: Equatable {
    case idle
    case applied(Int)
    case conflict([String])
}

struct WorkspaceSyncPayload: Sendable {
    let storageKey: String
    let payload: JSONValue
}

actor WorkspaceSyncEngine {
    private let store: WorkspaceFileStore
    private let cursorStore: RootineSyncCursorStore
    private let remote: WorkspaceRemoteClient
    private let encoder: JSONEncoder
    private let decoder = JSONDecoder()
    // Share one awaitable result between concurrent callers. Returning `.idle`
    // while another flush is active made the UI briefly claim everything was
    // synced even though the first request could still fail or conflict.
    private var inFlightFlush: Task<WorkspaceSyncOutcome, Error>?

    init(store: WorkspaceFileStore, remote: WorkspaceRemoteClient) {
        self.store = store
        cursorStore = RootineSyncCursorStore(store: store)
        self.remote = remote
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
    }

    func pendingMutationCount() async throws -> Int {
        try await store.pendingMutations().count
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
                cursor: try await cursorStore.current()
            )
            queue.removeAll { $0.storageKey == request.storageKey }
            queue.append(mutation)
            mutations.append(mutation)
        }
        try await store.replacePendingMutations(queue)
        return mutations
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
}
