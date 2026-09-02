import Foundation

enum DualWriteClientSource: String, Codable, Sendable {
    case web
    case ios
    case legacy
    case system
}

enum DualWriteOperationStatus: String, Codable, Sendable {
    case applied
    case alreadyApplied = "already_applied"
    case conflict
    case invalid
    case disabled
}

/// The request deliberately uses the legacy RPC name at the transport edge;
/// the B06 SQL overload routes it into the normalized bridge and materializes
/// the legacy snapshot after that commit.
struct DualWriteApplySnapshotRequest: Encodable, Sendable {
    let storageKey: String
    let payload: JSONValue
    let contentHash: String
    let expectedRevision: Int64
    let operationID: String
    let clientSource: DualWriteClientSource
    let correlationID: String
    let cursor: Int64

    enum CodingKeys: String, CodingKey {
        case storageKey = "p_storage_key"
        case payload = "p_payload"
        case contentHash = "p_content_hash"
        case expectedRevision = "p_expected_revision"
        case operationID = "p_operation_id"
        case clientSource = "p_client_source"
        case correlationID = "p_correlation_id"
        case cursor = "p_cursor"
    }
}

struct DualWriteReconciliationMetadata: Codable, Equatable, Sendable {
    let changedPaths: [String]
    let leftHash: String
    let rightHash: String
    let leftType: String
    let rightType: String
    let truncated: Bool

    enum CodingKeys: String, CodingKey {
        case changedPaths = "changed_paths"
        case leftHash = "left_hash"
        case rightHash = "right_hash"
        case leftType = "left_type"
        case rightType = "right_type"
        case truncated
    }
}

/// Cursor is account/device metadata, independent from a record revision.
/// It is persisted beside the existing file queue so force quit cannot cause
/// a later pull to replay an already acknowledged range as a new baseline.
actor RootineSyncCursorStore {
    private let store: WorkspaceFileStore

    init(store: WorkspaceFileStore) {
        self.store = store
    }

    func current() async throws -> Int64 {
        try await store.syncCursor()
    }

    func advance(to cursor: Int64) async throws {
        try await store.setSyncCursor(cursor)
    }
}
