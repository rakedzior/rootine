import Foundation
import Security
import UIKit
import UserNotifications

enum RootineAPNsEnvironment: String, Codable, CaseIterable, Sendable {
    case sandbox
    case production

    /// Debug builds are signed for the APNs sandbox. Release builds use the
    /// production APNs endpoint unless an xcconfig explicitly overrides it.
    static var currentBuild: RootineAPNsEnvironment {
#if DEBUG
        return .sandbox
#else
        return .production
#endif
    }

    /// Apple names its sandbox entitlement `development`; the database/API
    /// contract uses the clearer provider-facing name `sandbox`.
    var appleEntitlementValue: String {
        self == .sandbox ? "development" : "production"
    }
}

enum RootineNotificationPermissionState: String, Codable, CaseIterable, Sendable {
    case notDetermined = "not_determined"
    case denied
    case authorized
    case provisional
    case ephemeral
    case unknown

    init(authorizationStatus: UNAuthorizationStatus) {
        switch authorizationStatus {
        case .notDetermined:
            self = .notDetermined
        case .denied:
            self = .denied
        case .authorized:
            self = .authorized
        case .provisional:
            self = .provisional
        case .ephemeral:
            self = .ephemeral
        @unknown default:
            self = .unknown
        }
    }

    static func current() async -> RootineNotificationPermissionState {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                continuation.resume(returning: Self(authorizationStatus: settings.authorizationStatus))
            }
        }
    }

    var canRegisterWithAPNs: Bool {
        switch self {
        case .authorized, .provisional, .ephemeral:
            return true
        case .notDetermined, .denied, .unknown:
            return false
        }
    }
}

struct RootineDeviceRegistration: Codable, Equatable, Sendable {
    var deviceID: String
    var platform: String
    var appVersion: String
    var apnsEnvironment: RootineAPNsEnvironment
    var permissionState: RootineNotificationPermissionState
    var lastSeenAt: String
    var revokedAt: String?

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case platform
        case appVersion = "app_version"
        case apnsEnvironment = "apns_environment"
        case permissionState = "permission_state"
        case lastSeenAt = "last_seen_at"
        case revokedAt = "revoked_at"
    }
}

struct RootineDeviceRevocation: Codable, Equatable, Sendable {
    var deviceID: String
    var revokedAt: String?

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case revokedAt = "revoked_at"
    }
}

/// APNs registration callbacks are delivered by UIKit outside the SwiftUI
/// view hierarchy. Keep the latest token in memory and let AppEnvironment
/// associate it with the currently authenticated account. The token is never
/// written to disk or included in diagnostics.
final class RootinePushRegistry: @unchecked Sendable {
    static let shared = RootinePushRegistry()

    private let lock = NSLock()
    private var tokenData: Data?

    private init() {}

    func update(tokenData: Data) {
        lock.lock()
        self.tokenData = tokenData
        lock.unlock()
    }

    func tokenString() -> String? {
        lock.lock()
        defer { lock.unlock() }
        guard let tokenData, !tokenData.isEmpty else { return nil }
        return tokenData.map { String(format: "%02x", $0) }.joined()
    }
}

extension Notification.Name {
    static let rootineAPNsTokenDidRegister = Notification.Name("rootine.apns-token-did-register")
    static let rootineDeepLinkDidReceive = Notification.Name("rootine.deep-link-did-receive")
}

/// A Keychain-backed installation identifier. Keychain items survive an app
/// reinstall, so reinstall + APNs token rotation updates one installation row
/// instead of leaving an unbounded list of active device records. New
/// identifiers follow B01/B03's `ios_<lowercase UUIDv4>` contract. A bare UUID
/// already stored by an older build is retained so it continues to address its
/// existing `(user_id, device_id)` row; the server accepts that legacy form
/// during migration and no duplicate is created on reinstall.
protocol RootineDeviceIdentityProviding: Sendable {
    func loadOrCreate() -> String
}

final class RootineDeviceIdentityStore: RootineDeviceIdentityProviding, @unchecked Sendable {
    private let service: String
    private let account = "rootine-device-id"

    init(bundleIdentifier: String = Bundle.main.bundleIdentifier ?? "app.rootine.ios") {
        service = "\(bundleIdentifier).device"
    }

    static func makeIdentifier() -> String {
        "ios_\(UUID().uuidString.lowercased())"
    }

    static func isV3Identifier(_ identifier: String) -> Bool {
        guard identifier.hasPrefix("ios_") else { return false }
        return isUUIDv4(String(identifier.dropFirst(4)))
    }

    static func isLegacyIdentifier(_ identifier: String) -> Bool {
        isUUIDv4(identifier)
    }

    private static func isUUIDv4(_ value: String) -> Bool {
        let characters = Array(value)
        guard value == value.lowercased(),
              characters.count == 36,
              characters[8] == "-",
              characters[13] == "-",
              characters[18] == "-",
              characters[23] == "-",
              characters[14] == "4",
              "89ab".contains(characters[19]),
              UUID(uuidString: value) != nil else {
            return false
        }
        return true
    }

    func loadOrCreate() -> String {
        if let existing = load(), !existing.isEmpty {
            return existing
        }

        let identifier = Self.makeIdentifier()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: Data(identifier.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecDuplicateItem, let existing = load(), !existing.isEmpty {
            return existing
        }
        return identifier
    }

    private func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        return value
    }
}
