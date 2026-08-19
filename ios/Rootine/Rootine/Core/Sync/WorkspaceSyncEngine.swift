import CryptoKit
import Foundation

enum WorkspaceSyncOutcome: Equatable {
    case idle
    case applied(Int)
    case conflict([String])
}

actor WorkspaceSyncEngine {
    private let store: WorkspaceFileStore
    private let remote: WorkspaceRemoteClient
    private let encoder: JSONEncoder
    private let decoder = JSONDecoder()

    init(store: WorkspaceFileStore, remote: WorkspaceRemoteClient) {
        self.store = store
        self.remote = remote
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
    }

    func enqueue<T: Encodable>(_ value: T, key: RootineStorageKey) async throws {
        let data = try encoder.encode(value)
        let payload = try decoder.decode(JSONValue.self, from: data)
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let expectedRevision = try await store.revision(for: key.rawValue)
        try await store.enqueue(PendingWorkspaceMutation(
            id: UUID().uuidString,
            storageKey: key.rawValue,
            payload: payload,
            contentHash: digest,
            expectedRevision: expectedRevision,
            createdAt: RootineDate.isoTimestamp()
        ))
    }

    func flush(accessToken: String) async throws -> WorkspaceSyncOutcome {
        let queue = try await store.pendingMutations()
        guard !queue.isEmpty else { return .idle }
        var applied = 0
        var conflicts: [String] = []
        for mutation in queue {
            let response = try await remote.apply(mutation, accessToken: accessToken)
            if response.applied {
                try await store.setRevision(response.revision, for: mutation.storageKey)
                try await store.removeMutation(id: mutation.id)
                applied += 1
            } else {
                conflicts.append(mutation.storageKey)
            }
        }
        return conflicts.isEmpty ? .applied(applied) : .conflict(conflicts)
    }
}
