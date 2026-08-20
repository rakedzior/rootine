import Foundation

struct PendingWorkspaceMutation: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var storageKey: String
    var payload: JSONValue
    var contentHash: String
    var expectedRevision: Int64
    var createdAt: String
}

actor WorkspaceFileStore {
    private struct SyncMetadata: Codable {
        var revisions: [String: Int64] = [:]
    }

    private let fileManager: FileManager
    private let rootURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(userID: String, fileManager: FileManager = .default, rootURL: URL? = nil) {
        self.fileManager = fileManager
        let base = rootURL
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
                .appendingPathComponent("Rootine/Users", isDirectory: true)
                .appendingPathComponent(userID, isDirectory: true)
        self.rootURL = base
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
    }

    func load<T: Decodable & Sendable>(_ type: T.Type, key: RootineStorageKey) throws -> T? {
        try ensureDirectories()
        let url = workspaceURL(for: key)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try decoder.decode(T.self, from: Data(contentsOf: url))
    }

    func save<T: Encodable & Sendable>(_ value: T, key: RootineStorageKey) throws {
        try ensureDirectories()
        let url = workspaceURL(for: key)
        if fileManager.fileExists(atPath: url.path) {
            let recovery = recoveryDirectory
                .appendingPathComponent("\(safeName(key.rawValue))-\(Int(Date().timeIntervalSince1970)).json")
            try? fileManager.copyItem(at: url, to: recovery)
        }
        try protectedWrite(try encoder.encode(value), to: url)
    }

    func pendingMutations() throws -> [PendingWorkspaceMutation] {
        try ensureDirectories()
        guard fileManager.fileExists(atPath: queueURL.path) else { return [] }
        return try decoder.decode([PendingWorkspaceMutation].self, from: Data(contentsOf: queueURL))
    }

    func enqueue(_ mutation: PendingWorkspaceMutation) throws {
        var queue = try pendingMutations()
        queue.removeAll { $0.storageKey == mutation.storageKey }
        queue.append(mutation)
        try protectedWrite(try encoder.encode(queue), to: queueURL)
    }

    func removeMutation(id: String) throws {
        var queue = try pendingMutations()
        queue.removeAll { $0.id == id }
        try protectedWrite(try encoder.encode(queue), to: queueURL)
    }

    func revision(for storageKey: String) throws -> Int64 {
        try loadMetadata().revisions[storageKey] ?? 0
    }

    func setRevision(_ revision: Int64, for storageKey: String) throws {
        var metadata = try loadMetadata()
        metadata.revisions[storageKey] = revision
        try protectedWrite(try encoder.encode(metadata), to: metadataURL)
    }

    func clearAllLocalData() throws {
        if fileManager.fileExists(atPath: rootURL.path) {
            try fileManager.removeItem(at: rootURL)
        }
    }

    private var workspaceDirectory: URL { rootURL.appendingPathComponent("Workspaces", isDirectory: true) }
    private var recoveryDirectory: URL { rootURL.appendingPathComponent("Recovery", isDirectory: true) }
    private var queueURL: URL { rootURL.appendingPathComponent("pending-mutations.json") }
    private var metadataURL: URL { rootURL.appendingPathComponent("sync-metadata.json") }

    private func workspaceURL(for key: RootineStorageKey) -> URL {
        workspaceDirectory.appendingPathComponent("\(safeName(key.rawValue)).json")
    }

    private func safeName(_ value: String) -> String {
        value.replacingOccurrences(of: ".", with: "-")
    }

    private func ensureDirectories() throws {
        try fileManager.createDirectory(at: workspaceDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: recoveryDirectory, withIntermediateDirectories: true)
    }

    private func loadMetadata() throws -> SyncMetadata {
        try ensureDirectories()
        guard fileManager.fileExists(atPath: metadataURL.path) else { return SyncMetadata() }
        return try decoder.decode(SyncMetadata.self, from: Data(contentsOf: metadataURL))
    }

    private func protectedWrite(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: .atomic)
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: url.path
        )
    }
}
