import Foundation

/// A cursor is a server outbox position, not a record revision. It is stored
/// independently so acknowledging one command can never accidentally advance
/// (or rewind) the pull position.
actor RootineSyncCursorStore {
    private struct Envelope: Codable {
        var contractVersion: Int
        var accountID: String
        var deviceID: String
        var cursor: Int64
        var updatedAt: Date
    }

    private let fileManager: FileManager
    private let directoryURL: URL
    private let fileURL: URL
    private let accountID: String
    private let deviceID: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        accountID: String,
        deviceID: String,
        fileManager: FileManager = .default,
        rootURL: URL? = nil
    ) {
        self.fileManager = fileManager
        self.accountID = accountID
        self.deviceID = deviceID
        directoryURL = Self.directoryURL(
            accountID: accountID,
            deviceID: deviceID,
            fileManager: fileManager,
            rootURL: rootURL
        )
        fileURL = directoryURL.appendingPathComponent("cursor.json")
        encoder = JSONEncoder()
        decoder = JSONDecoder()
    }

    init(
        userID: String,
        deviceID: String,
        fileManager: FileManager = .default,
        rootURL: URL? = nil
    ) {
        self.fileManager = fileManager
        self.accountID = userID
        self.deviceID = deviceID
        directoryURL = Self.directoryURL(
            accountID: userID,
            deviceID: deviceID,
            fileManager: fileManager,
            rootURL: rootURL
        )
        fileURL = directoryURL.appendingPathComponent("cursor.json")
        encoder = JSONEncoder()
        decoder = JSONDecoder()
    }

    func load() throws -> Int64? {
        try ensureDirectory()
        guard fileManager.fileExists(atPath: fileURL.path) else { return nil }
        do {
            let envelope = try decoder.decode(Envelope.self, from: Data(contentsOf: fileURL))
            guard envelope.accountID == accountID, envelope.deviceID == deviceID, envelope.cursor >= 0 else {
                throw RootineSyncCursorError.invalid
            }
            return envelope.cursor
        } catch let error as RootineSyncCursorError {
            throw error
        } catch {
            // A malformed cursor must not silently become a guessed cursor.
            // The caller can perform a controlled bootstrap instead.
            throw RootineSyncCursorError.invalid
        }
    }

    func currentCursor() throws -> Int64? { try load() }

    @discardableResult
    func saveCursor(_ cursor: Int64) throws -> Int64 { try save(cursor) }

    @discardableResult
    func save(_ cursor: Int64) throws -> Int64 {
        guard cursor >= 0 else { throw RootineSyncCursorError.invalid }
        if let current = try load(), cursor < current {
            throw RootineSyncCursorError.regressed(current: current, requested: cursor)
        }
        try ensureDirectory()
        let envelope = Envelope(
            contractVersion: 1,
            accountID: accountID,
            deviceID: deviceID,
            cursor: cursor,
            updatedAt: Date()
        )
        let data = try encoder.encode(envelope)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return cursor
    }

    /// Cursor expiry is a state transition, not a rewind. Clearing makes the
    /// next bootstrap explicit while keeping the operation log untouched.
    func reset() throws {
        try ensureDirectory()
        guard fileManager.fileExists(atPath: fileURL.path) else { return }
        try fileManager.removeItem(at: fileURL)
    }

    func location() -> URL { fileURL }

    private func ensureDirectory() throws {
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
    }

    private static func safeName(_ value: String) -> String {
        let scalars = value.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == "_" {
                return Character(String(scalar))
            }
            return "-"
        }
        let result = String(scalars).replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
        return result.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    private static func directoryURL(
        accountID: String,
        deviceID: String,
        fileManager: FileManager,
        rootURL: URL?
    ) -> URL {
        let base: URL
        if let rootURL {
            base = rootURL
        } else {
            base = (fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? fileManager.temporaryDirectory)
                .appendingPathComponent("Rootine/Users", isDirectory: true)
                .appendingPathComponent(Self.safeName(accountID), isDirectory: true)
        }
        return base
            .appendingPathComponent("Sync", isDirectory: true)
            .appendingPathComponent(Self.safeName(deviceID), isDirectory: true)
    }
}
